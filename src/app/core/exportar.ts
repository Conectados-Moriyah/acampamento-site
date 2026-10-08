import { ETAPAS, respostaIgreja, textoValor } from './campos';
import { Inscricao } from './supabase';

/**
 * Baixa as inscrições como CSV no formato do Excel pt-BR (separador ";" e BOM UTF-8 para os acentos).
 * Uma coluna por campo da ficha, além dos campos de controle do admin.
 */
export function exportarInscricoes(inscricoes: Inscricao[]): void {
  const campos = ETAPAS.flatMap((e) =>
    Object.entries(e.campos).map(([campo, rotulo]) => ({ etapa: e.id, campo, rotulo })),
  );
  const cabecalho = ['Data', 'Tipo', 'Status', 'Lote', 'Valor', 'Pagamento', 'Observação', ...campos.map((c) => c.rotulo)];
  const linhas = inscricoes.map((i) => [
    new Date(i.criada_em).toLocaleString('pt-BR'),
    i.tipo === 'lider' ? 'Líder' : 'Participante',
    i.status,
    i.lote_numero ?? '',
    i.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '',
    textoValor(i.forma_pagamento),
    i.observacao ?? '',
    ...campos.map((c) =>
      textoValor(c.etapa === 'igreja' ? respostaIgreja(i.dados['igreja'], c.campo) : i.dados[c.etapa]?.[c.campo]),
    ),
  ]);

  const celula = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');

  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `inscricoes-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
