import { Inscricao, Parcela } from './supabase';

const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');

/** Conversa no WhatsApp com o telefone da inscrição, com a mensagem já escrita. */
export function linkWhatsapp(telefone: string, texto: string): string {
  const digitos = telefone.replace(/\D/g, '');
  const numero = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** Chave Pix (CNPJ) para pagar as parcelas do carnê. */
export const CHAVE_PIX = '58290597000136';

/** Para onde vão a cobrança e o recibo: o pagador do carnê, se tiver telefone, ou a inscrição. */
export const telefoneCobranca = (i: Inscricao) => i.pagador_telefone || i.telefone;

/** Primeiro nome de quem paga (o pagador do carnê ou o próprio inscrito). */
const saudacao = (i: Inscricao) => (i.pagador || i.nome).trim().split(/\s+/)[0];

export function textoCobranca(p: Parcela, i: Inscricao): string {
  const atrasada = p.vencimento < new Date().toLocaleDateString('sv-SE');
  return [
    `Olá, ${saudacao(i)}! Tudo bem?`,
    `${atrasada ? 'Consta em aberto' : 'Lembrete'} da parcela ${p.numero}/${p.total} do carnê ` +
      `da inscrição de ${i.nome} no Conectados — Acampamento Jovem Emanuel Moriyah.`,
    `Valor: ${brl(p.valor)}`,
    `Vencimento: ${data(p.vencimento)}${atrasada ? ' (vencida)' : ''}`,
    '',
    `Pix (CNPJ): ${CHAVE_PIX}`,
    '',
    'Depois de pagar, envie o comprovante por aqui. Obrigado!',
  ].join('\n');
}

export function textoRecibo(p: Parcela, i: Inscricao, pagoEm: string | null, pagoNoCarne: number, totalCarne: number): string {
  const saldo = totalCarne - pagoNoCarne;
  return [
    `Olá, ${saudacao(i)}! Recebemos o seu pagamento, obrigado!`,
    '',
    `*Recibo — Conectados, Acampamento Jovem Emanuel Moriyah*`,
    `Inscrição: ${i.nome}`,
    `Parcela: ${p.numero}/${p.total}`,
    `Valor: ${brl(p.valor)}`,
    `Pago em: ${pagoEm ? data(pagoEm) : '—'}`,
    `Total pago no carnê: ${brl(pagoNoCarne)} de ${brl(totalCarne)}`,
    saldo > 0 ? `Saldo restante: ${brl(saldo)}` : 'Carnê quitado! 🎉',
  ].join('\n');
}
