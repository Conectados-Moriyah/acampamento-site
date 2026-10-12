import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Inscricao, Movimento, Parcela } from '../../../core/supabase';

type Situacao = 'todas' | 'abertas' | 'atrasadas' | 'pagas';

const iso = (d: Date) => d.toLocaleDateString('sv-SE'); // yyyy-mm-dd no fuso local
const hoje = () => iso(new Date());
const inicioDoMes = () => {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
};
const fimDoMes = () => {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

/** Nome comparável: sem acentos, minúsculo e com espaços simples. */
const chave = (nome: string) =>
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Contas a receber: parcelas dos carnês filtradas pelo dia de vencimento, agrupadas por dia. */
@Component({
  imports: [CurrencyPipe, DatePipe],
  selector: 'app-receber',
  styleUrl: './receber.scss',
  templateUrl: './receber.html',
})
export class ReceberPage {
  readonly inscricoes = input.required<Inscricao[]>();
  readonly parcelas = input.required<Parcela[]>();
  readonly movimentos = input<Movimento[]>([]);

  protected readonly de = signal(inicioDoMes());
  protected readonly ate = signal(fimDoMes());
  protected readonly situacao = signal<Situacao>('abertas');
  protected readonly hoje = hoje();
  /** Filtro por quem paga ('' = todos). Sem pagador definido, o pagador é o próprio inscrito. */
  protected readonly pagador = signal('');

  /**
   * Pagadores do filtro, por chave normalizada: quem paga o carnê de outra pessoa e também tem
   * inscrição própria cai no mesmo item, mesmo com diferença de maiúsculas, acentos ou espaços.
   */
  protected readonly pagadores = computed(() => {
    const comParcela = new Set(this.parcelas().map((p) => p.inscricao_id));
    const porChave = new Map<string, string>();
    for (const i of this.inscricoes()) {
      if (i.status === 'cancelada' || !comParcela.has(i.id)) continue;
      const nome = i.pagador || i.nome;
      // Prefere a grafia do nome da inscrição, se o pagador também for inscrito.
      if (!porChave.has(chave(nome)) || !i.pagador) porChave.set(chave(nome), nome);
    }
    return [...porChave]
      .map(([valor, nome]) => ({ valor, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  });

  private readonly lista = computed(() => {
    const nomes = new Map(
      this.inscricoes()
        .filter((i) => i.status !== 'cancelada')
        .map((i) => [i.id, i] as const),
    );
    const pagoEm = new Map(this.movimentos().map((m) => [m.id, m.data] as const));
    const [de, ate, s, h, pg] = [this.de(), this.ate(), this.situacao(), this.hoje, this.pagador()];
    return this.parcelas()
      .filter((p) => nomes.has(p.inscricao_id))
      .filter((p) => {
        const i = nomes.get(p.inscricao_id)!;
        return !pg || chave(i.pagador || i.nome) === pg;
      })
      .filter((p) => (!de || p.vencimento >= de) && (!ate || p.vencimento <= ate))
      .filter(
        (p) =>
          s === 'todas' ||
          (s === 'pagas' && !!p.movimento_id) ||
          (s === 'abertas' && !p.movimento_id) ||
          (s === 'atrasadas' && !p.movimento_id && p.vencimento < h),
      )
      .map((p) => ({
        parcela: p,
        inscricao: nomes.get(p.inscricao_id)!,
        pagoEm: p.movimento_id ? (pagoEm.get(p.movimento_id) ?? null) : null,
        estado: p.movimento_id ? 'paga' : p.vencimento < h ? 'atrasada' : 'aberta',
      }))
      .sort(
        (a, b) =>
          a.parcela.vencimento.localeCompare(b.parcela.vencimento) ||
          a.inscricao.nome.localeCompare(b.inscricao.nome),
      );
  });

  protected readonly dias = computed(() => {
    const grupos = new Map<string, ReturnType<typeof this.lista>>();
    for (const item of this.lista()) {
      const v = item.parcela.vencimento;
      grupos.set(v, [...(grupos.get(v) ?? []), item]);
    }
    return [...grupos].map(([dia, itens]) => ({
      dia,
      itens,
      total: itens.reduce((t, i) => t + Number(i.parcela.valor), 0),
    }));
  });

  protected readonly totais = computed(() => {
    const itens = this.lista();
    const soma = (estado?: string) =>
      itens.filter((i) => !estado || i.estado === estado).reduce((t, i) => t + Number(i.parcela.valor), 0);
    return {
      qtd: itens.length,
      total: soma(),
      aReceber: soma('aberta') + soma('atrasada'),
      atrasado: soma('atrasada'),
      recebido: soma('paga'),
    };
  });

  protected periodo(tipo: 'hoje' | 'semana' | 'mes' | 'tudo'): void {
    const d = new Date();
    if (tipo === 'hoje') {
      this.de.set(hoje());
      this.ate.set(hoje());
    } else if (tipo === 'semana') {
      this.de.set(hoje());
      this.ate.set(iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6)));
    } else if (tipo === 'mes') {
      this.de.set(inicioDoMes());
      this.ate.set(fimDoMes());
    } else {
      this.de.set('');
      this.ate.set('');
    }
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
