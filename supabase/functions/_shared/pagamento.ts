// Pagamento online (InfinitePay) — código compartilhado pelas Edge Functions.
//
// Segredos (Supabase > Edge Functions > Secrets, ou `supabase secrets set`), nunca no repositório:
//   SB_SECRET_KEY       chave secreta do Supabase (sb_secret_...), ignora o RLS
//   INFINITEPAY_HANDLE  InfiniteTag da conta, sem o "$"
//   SITE_URL            endereço público do site, sem barra no fim
// SUPABASE_URL é preenchida automaticamente pelo Supabase.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const API = 'https://api.checkout.infinitepay.io';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O site (GitHub Pages) chama as funções de outro domínio: libera o CORS. Não há cookies/sessão. */
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function config() {
  const handle = Deno.env.get('INFINITEPAY_HANDLE');
  const chave = Deno.env.get('SB_SECRET_KEY');
  const site = Deno.env.get('SITE_URL')?.replace(/\/$/, '');
  const url = Deno.env.get('SUPABASE_URL');
  if (!handle || !chave || !site || !url) {
    throw new Error('Pagamento online não configurado (INFINITEPAY_HANDLE, SB_SECRET_KEY e SITE_URL nos Secrets).');
  }
  return {
    handle,
    site,
    webhook: `${url}/functions/v1/infinitepay-webhook`,
    supabase: createClient(url, chave, { auth: { persistSession: false } }),
  };
}

const centavos = (valor: number) => Math.round(valor * 100);

/**
 * Quanto falta pagar: valor da inscrição menos o que já entrou no caixa por ela (ex.: cupom de
 * doação aplicado no link). É o que o checkout cobra.
 */
async function restante(supabase: SupabaseClient, id: string, valor: number): Promise<number> {
  const { data, error } = await supabase
    .from('movimentos')
    .select('tipo, valor')
    .eq('caixa', 'inscricao')
    .eq('inscricao_id', id);
  if (error) throw error;
  const pago = (data as { tipo: string; valor: number }[]).reduce(
    (t, m) => t + (m.tipo === 'entrada' ? 1 : -1) * Number(m.valor),
    0,
  );
  return Math.max(0, Math.round((Number(valor) - pago) * 100) / 100);
}

function post(caminho: string, corpo: unknown): Promise<Response> {
  return fetch(`${API}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
  });
}

/** Cria o link de pagamento da inscrição. O valor é o do banco, não o enviado pelo navegador. */
export async function criarCheckout(inscricaoId: unknown): Promise<Response> {
  const id = String(inscricaoId ?? '');
  if (!UUID.test(id)) return json({ erro: 'Inscrição inválida.' }, 400);

  const { handle, site, webhook, supabase } = config();
  const { data: insc, error } = await supabase
    .from('inscricoes')
    .select('id, nome, telefone, email, tipo, status, valor, lote_numero, forma_pagamento')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  // Cupom cobriu tudo: o banco já confirmou a inscrição e não há o que cobrar.
  if (insc?.status === 'confirmada' && insc.valor && (await restante(supabase, insc.id, insc.valor)) === 0) {
    return json({ quitada: true });
  }
  if (!insc || insc.status !== 'pendente' || insc.forma_pagamento !== 'avista' || !insc.valor) {
    return json({ erro: 'Esta inscrição não está aguardando pagamento.' }, 409);
  }
  const aPagar = await restante(supabase, insc.id, insc.valor);
  if (aPagar === 0) return json({ quitada: true });
  const comCupom = aPagar < Number(insc.valor);

  const digitos = String(insc.telefone).replace(/\D/g, '');
  const customer: Record<string, string> = { name: insc.nome };
  if (insc.email) customer['email'] = insc.email;
  if (digitos.length >= 10) customer['phone_number'] = `+55${digitos}`;

  const resposta = await post('/links', {
    handle,
    order_nsu: insc.id,
    items: [
      {
        quantity: 1,
        price: centavos(aPagar),
        description: `Inscrição Conectados — ${insc.tipo === 'lider' ? 'apoio' : 'participante'} (lote ${insc.lote_numero})${comCupom ? ' com cupom' : ''}`,
      },
    ],
    redirect_url: `${site}/inscricao/pago`,
    webhook_url: webhook,
    customer,
  });
  const link = (await resposta.json().catch(() => null)) as Record<string, unknown> | null;
  const url = link && (link['url'] ?? link['link'] ?? link['checkout_url']);
  if (!resposta.ok || typeof url !== 'string') {
    console.error('InfinitePay /links falhou', resposta.status, link);
    return json({ erro: 'Não foi possível abrir o pagamento.' }, 502);
  }
  return json({ url });
}

/**
 * Confirma um pagamento. O payload (do webhook ou do redirecionamento do navegador) nunca é
 * confiado: o pagamento é conferido na própria InfinitePay (`payment_check`) e o valor contra o que
 * faltava pagar. Vale para participante e líder (mesma tabela e mesma função do banco).
 */
export async function confirmarPagamento(dados: Record<string, unknown>): Promise<Response> {
  const { order_nsu, transaction_nsu, capture_method } = dados;
  const slug = dados['invoice_slug'] ?? dados['slug'];
  if (!UUID.test(String(order_nsu)) || !transaction_nsu || !slug) {
    return json({ erro: 'Payload inválido.' }, 400);
  }

  const { handle, supabase } = config();
  const conferencia = await post('/payment_check', { handle, order_nsu, transaction_nsu, slug });
  const pago = (await conferencia.json().catch(() => null)) as {
    success?: boolean;
    paid?: boolean;
    amount?: number;
    capture_method?: string;
  } | null;
  if (!conferencia.ok || !pago?.success || !pago.paid) {
    console.error('Pagamento InfinitePay não confirmado', order_nsu, conferencia.status, pago);
    return json({ erro: 'Pagamento não confirmado.' }, 400);
  }

  const { data: insc, error } = await supabase
    .from('inscricoes')
    .select('valor')
    .eq('id', order_nsu)
    .maybeSingle();
  if (error) throw error;
  // Compara com o que faltava pagar (o cupom já entrou no caixa). Se já está lançado (webhook
  // reenviado), não falta nada e não há o que gravar.
  const aPagar = insc?.valor ? await restante(supabase, String(order_nsu), insc.valor) : 0;
  if (insc?.valor && aPagar === 0) return json({ ok: true });
  if (!insc?.valor || (pago.amount ?? 0) < centavos(aPagar)) {
    // Não adianta tentar de novo: avisa no log e encerra para a InfinitePay parar de reenviar.
    console.error('Pagamento InfinitePay com valor divergente', order_nsu, pago.amount, insc?.valor);
    return json({ ignorado: true });
  }

  const { error: erroRpc } = await supabase.rpc('registrar_pagamento_online', {
    p_inscricao: order_nsu,
    p_valor: aPagar,
    p_forma: (pago.capture_method ?? capture_method) === 'pix' ? 'pix' : 'cartao',
    p_nsu: String(transaction_nsu),
  });
  if (erroRpc) throw erroRpc;
  return json({ ok: true });
}

/** Envolve o handler: responde o preflight do CORS, aceita só POST e trata erros. */
export function servir(handler: (corpo: Record<string, unknown>) => Promise<Response>, statusErro = 500) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
    try {
      const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      return await handler(corpo);
    } catch (e) {
      console.error(e);
      return json({ erro: 'Falha ao processar.' }, statusErro);
    }
  });
}
