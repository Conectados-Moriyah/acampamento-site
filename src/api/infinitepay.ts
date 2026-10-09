import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { Router, json } from 'express';
import { environment } from '../environments/environment';

const API = 'https://api.checkout.infinitepay.io';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Configuração do pagamento fica no arquivo .env da raiz (veja .env.example). Variáveis que já
// existem no ambiente têm prioridade sobre o arquivo.
try {
  process.loadEnvFile();
} catch {
  // sem .env: vale o que estiver no ambiente
}

function config() {
  const handle = process.env['INFINITEPAY_HANDLE'];
  const chave = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const site = process.env['SITE_URL']?.replace(/\/$/, '');
  if (!handle || !chave || !site) {
    throw new Error(
      'Pagamento online não configurado (INFINITEPAY_HANDLE, SUPABASE_SERVICE_ROLE_KEY e SITE_URL no .env).',
    );
  }
  return { handle, site, supabase: createClient(environment.supabaseUrl, chave) };
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

async function post(caminho: string, corpo: unknown): Promise<Response> {
  return fetch(`${API}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
  });
}

export const infinitepay = Router();
infinitepay.use(json());

/** Cria o link de pagamento da inscrição. O valor é o do banco, não o enviado pelo navegador. */
infinitepay.post('/checkout', async (req, res) => {
  try {
    const id = String(req.body?.inscricaoId ?? '');
    if (!UUID.test(id)) return void res.status(400).json({ erro: 'Inscrição inválida.' });

    const { handle, site, supabase } = config();
    const { data: insc, error } = await supabase
      .from('inscricoes')
      .select('id, nome, telefone, email, tipo, status, valor, lote_numero, forma_pagamento')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    // Cupom cobriu tudo: o banco já confirmou a inscrição e não há o que cobrar.
    if (insc?.status === 'confirmada' && insc.valor && (await restante(supabase, insc.id, insc.valor)) === 0) {
      return void res.json({ quitada: true });
    }
    if (!insc || insc.status !== 'pendente' || insc.forma_pagamento !== 'avista' || !insc.valor) {
      return void res.status(409).json({ erro: 'Esta inscrição não está aguardando pagamento.' });
    }
    const aPagar = await restante(supabase, insc.id, insc.valor);
    if (aPagar === 0) return void res.json({ quitada: true });
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
      webhook_url: `${site}/api/infinitepay/webhook`,
      customer,
    });
    const link = (await resposta.json().catch(() => null)) as Record<string, unknown> | null;
    const url = link && (link['url'] ?? link['link'] ?? link['checkout_url']);
    if (!resposta.ok || typeof url !== 'string') {
      console.error('InfinitePay /links falhou', resposta.status, link);
      return void res.status(502).json({ erro: 'Não foi possível abrir o pagamento.' });
    }
    res.json({ url });
  } catch (e) {
    console.error('Erro em /api/checkout', e);
    res.status(500).json({ erro: 'Não foi possível abrir o pagamento.' });
  }
});

interface Retorno {
  status: number;
  corpo: Record<string, unknown>;
}

/**
 * Confirma um pagamento. O payload (do webhook ou do redirecionamento do navegador) nunca é
 * confiado: o pagamento é conferido na própria InfinitePay (`payment_check`) e o valor contra o da
 * inscrição. Vale para participante e líder (mesma tabela e mesma função do banco).
 */
async function confirmarPagamento(dados: Record<string, unknown>): Promise<Retorno> {
  const { order_nsu, transaction_nsu, capture_method } = dados;
  const slug = dados['invoice_slug'] ?? dados['slug'];
  if (!UUID.test(String(order_nsu)) || !transaction_nsu || !slug) {
    return { status: 400, corpo: { erro: 'Payload inválido.' } };
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
    return { status: 400, corpo: { erro: 'Pagamento não confirmado.' } };
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
  if (insc?.valor && aPagar === 0) return { status: 200, corpo: { ok: true } };
  if (!insc?.valor || (pago.amount ?? 0) < centavos(aPagar)) {
    // Não adianta tentar de novo: avisa no log e encerra para a InfinitePay parar de reenviar.
    console.error(
      'Pagamento InfinitePay com valor divergente',
      order_nsu,
      pago.amount,
      insc?.valor,
    );
    return { status: 200, corpo: { ignorado: true } };
  }

  const { error: erroRpc } = await supabase.rpc('registrar_pagamento_online', {
    p_inscricao: order_nsu,
    p_valor: aPagar,
    p_forma: (pago.capture_method ?? capture_method) === 'pix' ? 'pix' : 'cartao',
    p_nsu: String(transaction_nsu),
  });
  if (erroRpc) throw erroRpc;
  return { status: 200, corpo: { ok: true } };
}

/** Webhook da InfinitePay. 200 = processado (ou já processado); 400 = a InfinitePay tenta de novo. */
infinitepay.post('/infinitepay/webhook', async (req, res) => {
  try {
    const { status, corpo } = await confirmarPagamento(req.body ?? {});
    res.status(status).json(corpo);
  } catch (e) {
    console.error('Erro no webhook InfinitePay', e);
    res.status(400).json({ erro: 'Falha ao processar.' });
  }
});

/**
 * Confirmação pelo retorno do navegador (`/inscricao/pago?order_nsu=...`). Cobre o caso em que o
 * webhook não chega (ex.: site em localhost). É seguro: a confirmação é feita na InfinitePay e a
 * gravação é idempotente (o mesmo `transaction_nsu` nunca lança duas vezes).
 */
infinitepay.post('/pagamento/confirmar', async (req, res) => {
  try {
    const { status, corpo } = await confirmarPagamento(req.body ?? {});
    res.status(status).json(corpo);
  } catch (e) {
    console.error('Erro em /api/pagamento/confirmar', e);
    res.status(500).json({ erro: 'Falha ao confirmar.' });
  }
});
