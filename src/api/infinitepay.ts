import { createClient } from '@supabase/supabase-js';
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
    throw new Error('Pagamento online não configurado (INFINITEPAY_HANDLE, SUPABASE_SERVICE_ROLE_KEY e SITE_URL no .env).');
  }
  return { handle, site, supabase: createClient(environment.supabaseUrl, chave) };
}

const centavos = (valor: number) => Math.round(valor * 100);

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
    if (!insc || insc.status !== 'pendente' || insc.forma_pagamento !== 'avista' || !insc.valor) {
      return void res.status(409).json({ erro: 'Esta inscrição não está aguardando pagamento.' });
    }

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
          price: centavos(insc.valor),
          description: `Inscrição Conectados — ${insc.tipo === 'lider' ? 'apoio' : 'participante'} (lote ${insc.lote_numero})`,
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

/**
 * Webhook da InfinitePay. O payload não é assinado, então nunca é confiado: o pagamento é
 * conferido na própria InfinitePay (`payment_check`) e o valor contra o da inscrição.
 * 200 = processado (ou já processado); 400 = a InfinitePay tenta de novo.
 */
infinitepay.post('/infinitepay/webhook', async (req, res) => {
  try {
    const { order_nsu, transaction_nsu, invoice_slug, capture_method } = req.body ?? {};
    if (!UUID.test(String(order_nsu)) || !transaction_nsu || !invoice_slug) {
      return void res.status(400).json({ erro: 'Payload inválido.' });
    }

    const { handle, supabase } = config();
    const conferencia = await post('/payment_check', {
      handle,
      order_nsu,
      transaction_nsu,
      slug: invoice_slug,
    });
    const pago = (await conferencia.json().catch(() => null)) as {
      success?: boolean;
      paid?: boolean;
      amount?: number;
      capture_method?: string;
    } | null;
    if (!conferencia.ok || !pago?.success || !pago.paid) {
      console.error('Webhook InfinitePay não confirmado', order_nsu, conferencia.status, pago);
      return void res.status(400).json({ erro: 'Pagamento não confirmado.' });
    }

    const { data: insc, error } = await supabase
      .from('inscricoes')
      .select('valor')
      .eq('id', order_nsu)
      .maybeSingle();
    if (error) throw error;
    if (!insc?.valor || (pago.amount ?? 0) < centavos(insc.valor)) {
      // Não adianta tentar de novo: avisa no log e encerra para a InfinitePay parar de reenviar.
      console.error('Webhook InfinitePay com valor divergente', order_nsu, pago.amount, insc?.valor);
      return void res.status(200).json({ ignorado: true });
    }

    const { error: erroRpc } = await supabase.rpc('registrar_pagamento_online', {
      p_inscricao: order_nsu,
      p_valor: insc.valor,
      p_forma: (pago.capture_method ?? capture_method) === 'pix' ? 'pix' : 'cartao',
      p_nsu: String(transaction_nsu),
    });
    if (erroRpc) throw erroRpc;
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Erro no webhook InfinitePay', e);
    res.status(400).json({ erro: 'Falha ao processar.' });
  }
});
