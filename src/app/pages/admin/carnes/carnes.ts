import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormaPagamento, Inscricao, Parcela, Supabase } from '../../../core/supabase';

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
  readonly alterado = output();

  protected readonly filtro = signal<Filtro>('');
  /** Parcela com o formulário de baixa aberto. */
  protected readonly pagando = signal<string | null>(null);
  protected readonly forma = signal<FormaPagamento>('pix');
  protected readonly dataPagamento = signal(hoje());
  /** Inscrição com o formulário de gerar/refazer parcelas aberto (`'nova'` = colocar alguém no carnê). */
  protected readonly gerando = signal<string | null>(null);
  protected readonly novoInscrito = signal('');
  protected readonly totalParcelas = signal(3);
  protected readonly primeiroVencimento = signal(proximoDia10());
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
  }

  protected async gerar(): Promise<void> {
    const id = this.gerando() === 'nova' ? this.novoInscrito() : this.gerando();
    if (!id) return;
    this.ocupado.set(true);
    try {
      await this.supabase.gerarCarne(id, this.totalParcelas(), this.primeiroVencimento());
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

  /** Estornar = excluir o lançamento do caixa; a parcela volta a ficar em aberto. */
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

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
