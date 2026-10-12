import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormaPagamento, Inscricao, Movimento, Parcela, Supabase } from '../../../core/supabase';

type Situacao = 'paga' | 'atrasada' | 'aberta';
type Filtro = '' | 'atrasados' | 'em-dia' | 'quitados';

const hoje = () => new Date().toLocaleDateString('sv-SE'); // yyyy-mm-dd no fuso local
const proximoDia10 = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 10).toLocaleDateString('sv-SE');
};
const mensagem = (e: unknown) => String((e as { message?: string })?.message ?? '');

@Component({
  imports: [CurrencyPipe, DatePipe, NgTemplateOutlet],
  selector: 'app-carnes',
  styleUrl: './carnes.scss',
  templateUrl: './carnes.html',
})
export class CarnesPage {
  private readonly supabase = inject(Supabase);

  readonly inscricoes = input.required<Inscricao[]>();
  readonly parcelas = input.required<Parcela[]>();
  readonly movimentos = input<Movimento[]>([]);
  readonly alterado = output();

  protected readonly filtro = signal<Filtro>('');
  /** Parcela com o formulário de baixa aberto. */
  protected readonly pagando = signal<string | null>(null);
  protected readonly forma = signal<FormaPagamento>('pix');
  protected readonly dataPagamento = signal(hoje());
  /** Parcela com o vencimento em edição. */
  protected readonly editandoVencimento = signal<string | null>(null);
  protected readonly novoVencimento = signal('');
  /** Inscrição com o formulário de gerar/refazer parcelas aberto (`'nova'` = colocar alguém no carnê). */
  protected readonly gerando = signal<string | null>(null);
  protected readonly novoInscrito = signal('');
  protected readonly totalParcelas = signal(3);
  protected readonly primeiroVencimento = signal(proximoDia10());
  protected readonly pagador = signal('');
  /** Inscrição com o pagador em edição. */
  protected readonly editandoPagador = signal<string | null>(null);
  protected readonly novoPagador = signal('');
  protected readonly ocupado = signal(false);

  protected situacao(p: Parcela): Situacao {
    if (p.movimento_id) return 'paga';
    return p.vencimento < hoje() ? 'atrasada' : 'aberta';
  }

  protected readonly carnes = computed(() => {
    const porInscricao = new Map<string, Parcela[]>();
    for (const p of this.parcelas()) {
      porInscricao.set(p.inscricao_id, [...(porInscricao.get(p.inscricao_id) ?? []), p]);
    }
    return this.inscricoes()
      .filter((i) => i.status !== 'cancelada' && (i.forma_pagamento === 'carne' || porInscricao.has(i.id)))
      .map((i) => {
        const parcelas = (porInscricao.get(i.id) ?? []).sort((a, b) => a.numero - b.numero);
        const pago = parcelas.filter((p) => p.movimento_id).reduce((t, p) => t + Number(p.valor), 0);
        const atrasadas = parcelas.filter((p) => this.situacao(p) === 'atrasada');
        return {
          inscricao: i,
          parcelas,
          pago,
          total: parcelas.reduce((t, p) => t + Number(p.valor), 0),
          atrasadas: atrasadas.length,
          quitado: parcelas.length > 0 && parcelas.every((p) => p.movimento_id),
          temPaga: parcelas.some((p) => p.movimento_id),
        };
      })
      .sort((a, b) => b.atrasadas - a.atrasadas || a.inscricao.nome.localeCompare(b.inscricao.nome));
  });

  protected readonly filtrados = computed(() => {
    const f = this.filtro();
    return this.carnes().filter(
      (c) =>
        !f ||
        (f === 'atrasados' && c.atrasadas > 0) ||
        (f === 'quitados' && c.quitado) ||
        (f === 'em-dia' && c.atrasadas === 0 && !c.quitado),
    );
  });

  protected readonly totais = computed(() => {
    const ativas = new Set(this.carnes().map((c) => c.inscricao.id));
    const parcelas = this.parcelas().filter((p) => ativas.has(p.inscricao_id));
    const soma = (lista: Parcela[]) => lista.reduce((t, p) => t + Number(p.valor), 0);
    const atrasadas = parcelas.filter((p) => this.situacao(p) === 'atrasada');
    return {
      carnes: ativas.size,
      recebido: soma(parcelas.filter((p) => p.movimento_id)),
      aReceber: soma(parcelas.filter((p) => !p.movimento_id)),
      atrasado: soma(atrasadas),
      qtdAtrasadas: atrasadas.length,
    };
  });

  /** Inscrições à vista que podem passar para o carnê. */
  protected readonly semCarne = computed(() => {
    const comCarne = new Set(this.carnes().map((c) => c.inscricao.id));
    return this.inscricoes()
      .filter((i) => i.status !== 'cancelada' && !comCarne.has(i.id) && i.valor)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  });

  protected abrirGerar(inscricao: Inscricao | 'nova'): void {
    this.gerando.set(inscricao === 'nova' ? 'nova' : inscricao.id);
    this.totalParcelas.set(inscricao !== 'nova' && inscricao.parcelas_solicitadas ? inscricao.parcelas_solicitadas : 3);
    this.primeiroVencimento.set(proximoDia10());
    this.novoInscrito.set('');
    this.pagador.set(inscricao !== 'nova' ? (inscricao.pagador ?? '') : '');
  }

  /** Troca quem paga o carnê sem mexer nas parcelas. */
  protected abrirPagador(i: Inscricao): void {
    this.editandoPagador.set(i.id);
    this.novoPagador.set(i.pagador ?? '');
  }

  protected async salvarPagador(i: Inscricao): Promise<void> {
    this.ocupado.set(true);
    try {
      await this.supabase.atualizarInscricao(i.id, { pagador: this.novoPagador().trim() || null });
      this.editandoPagador.set(null);
      this.alterado.emit();
    } catch {
      alert('Não foi possível alterar o pagador.');
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async gerar(): Promise<void> {
    const id = this.gerando() === 'nova' ? this.novoInscrito() : this.gerando();
    if (!id) return;
    this.ocupado.set(true);
    try {
      await this.supabase.gerarCarne(id, this.totalParcelas(), this.primeiroVencimento());
      await this.supabase.atualizarInscricao(id, { pagador: this.pagador().trim() || null });
      this.gerando.set(null);
      this.alterado.emit();
    } catch (e) {
      const m = mensagem(e);
      alert(
        m.includes('CARNE_COM_PARCELA_PAGA')
          ? 'Esse carnê já tem parcela paga. Estorne as parcelas pagas antes de refazer.'
          : m.includes('INSCRICAO_SEM_VALOR')
            ? 'A inscrição está sem valor. Defina o valor no painel da inscrição.'
            : 'Não foi possível gerar as parcelas.',
      );
    } finally {
      this.ocupado.set(false);
    }
  }

  protected abrirPagar(p: Parcela): void {
    this.pagando.set(p.id);
    this.forma.set('pix');
    this.dataPagamento.set(hoje());
  }

  protected async pagar(p: Parcela): Promise<void> {
    this.ocupado.set(true);
    try {
      await this.supabase.pagarParcela(p.id, this.forma(), this.dataPagamento());
      this.pagando.set(null);
      this.alterado.emit();
    } catch (e) {
      alert(mensagem(e).includes('PARCELA_JA_PAGA') ? 'Essa parcela já foi paga.' : 'Não foi possível dar baixa.');
    } finally {
      this.ocupado.set(false);
    }
  }

  protected abrirVencimento(p: Parcela): void {
    this.editandoVencimento.set(p.id);
    this.novoVencimento.set(p.vencimento);
  }

  protected async salvarVencimento(p: Parcela): Promise<void> {
    if (!this.novoVencimento()) return;
    this.ocupado.set(true);
    try {
      await this.supabase.alterarVencimento(p.id, this.novoVencimento());
      this.editandoVencimento.set(null);
      this.alterado.emit();
    } catch {
      alert('Não foi possível alterar o vencimento.');
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Estornar =excluir o lançamento do caixa; a parcela volta a ficar em aberto. */
  protected async estornar(p: Parcela, nome: string): Promise<void> {
    if (!p.movimento_id || !confirm(`Estornar a parcela ${p.numero}/${p.total} de ${nome}? O lançamento sai do caixa.`)) return;
    this.ocupado.set(true);
    try {
      await this.supabase.excluirMovimento(p.movimento_id);
      this.alterado.emit();
    } catch {
      alert('Não foi possível estornar.');
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Abre o recibo da parcela paga numa janela pronta para imprimir ou salvar em PDF. */
  protected recibo(p: Parcela, inscricao: Inscricao): void {
    const m = this.movimentos().find((x) => x.id === p.movimento_id);
    const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const data = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');
    const formas: Record<FormaPagamento, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', outro: 'Outro', cupom: 'Cupom' };
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const doCarne = this.parcelas().filter((x) => x.inscricao_id === inscricao.id);
    const totalCarne = doCarne.reduce((t, x) => t + Number(x.valor), 0);
    const totalPago = doCarne.filter((x) => x.movimento_id).reduce((t, x) => t + Number(x.valor), 0);
    const numero = (p.movimento_id ?? p.id).slice(0, 8).toUpperCase();
    const janela = window.open('', '_blank', 'width=720,height=800');
    if (!janela) {
      alert('Libere os pop-ups do site para abrir o recibo.');
      return;
    }
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${numero}</title>
<style>body{font-family:Inter,Arial,sans-serif;color:#1a1a2e;max-width:640px;margin:32px auto;padding:0 16px}
h1{font-size:22px;margin:0}header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1e3a8a;padding-bottom:8px}
.valor{font-size:26px;font-weight:700;margin:24px 0}dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px}dt{color:#555}dd{margin:0}
.assinatura{margin-top:64px;text-align:center}.assinatura span{display:inline-block;border-top:1px solid #333;padding-top:4px;min-width:280px}
.rodape{text-align:center;color:#777;font-size:12px}@media print{button{display:none}}</style></head><body>
<header><h1>Recibo de pagamento</h1><span>Nº ${numero}</span></header>
<p>Recebemos de <strong>${esc(inscricao.pagador || inscricao.nome)}</strong> a importância abaixo, referente à parcela <strong>${p.numero}/${p.total}</strong> do carnê da inscrição${inscricao.pagador ? ` de <strong>${esc(inscricao.nome)}</strong>` : ''} no Conectados — Acampamento Jovem Emanuel Moriyah.</p>
<p class="valor">${brl(p.valor)}</p>
<dl><dt>Parcela</dt><dd>${p.numero} de ${p.total}</dd>
<dt>Vencimento</dt><dd>${data(p.vencimento)}</dd>
<dt>Pago em</dt><dd>${m ? data(m.data) : '—'}</dd>
<dt>Forma</dt><dd>${m?.forma ? formas[m.forma] : '—'}</dd>
<dt>Total pago no carnê</dt><dd>${brl(totalPago)} de ${brl(totalCarne)}</dd>
<dt>Saldo restante</dt><dd>${brl(totalCarne - totalPago)}</dd></dl>
<p class="assinatura"><span>Responsável pelo recebimento</span></p>
<p class="rodape">Emitido em ${new Date().toLocaleDateString('pt-BR')}</p>
<p class="rodape"><button onclick="print()">Imprimir / salvar PDF</button></p>
</body></html>`);
    janela.document.close();
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
