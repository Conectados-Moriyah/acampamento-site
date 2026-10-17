import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormaPagamento, Inscricao, Movimento, Parcela, Supabase } from '../../../core/supabase';
import {
  linkWhatsapp,
  telefoneCobranca,
  textoCobranca,
  textoCobrancaPagador,
  textoReciboPagador,
} from '../../../core/whatsapp';

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
  private readonly supabase = inject(Supabase);

  readonly inscricoes = input.required<Inscricao[]>();
  readonly parcelas = input.required<Parcela[]>();
  readonly movimentos = input<Movimento[]>([]);
  readonly alterado = output();

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

  /** Parcelas fora da baixa conjunta (por padrão entram todas as em aberto do pagador). */
  protected readonly desmarcadas = signal<ReadonlySet<string>>(new Set());
  protected readonly forma = signal<FormaPagamento>('pix');
  protected readonly dataPagamento = signal(hoje());
  protected readonly comprovante = signal<File | null>(null);
  protected readonly ocupado = signal(false);
  /** Link do recibo da última baixa conjunta, para enviar no WhatsApp. */
  protected readonly reciboConjunto = signal<string | null>(null);

  /** Todas as parcelas em aberto do pagador escolhido, de qualquer vencimento e carnê. */
  protected readonly abertasDoPagador = computed(() => {
    const pg = this.pagador();
    if (!pg) return [];
    const doPagador = new Map(
      this.inscricoes()
        .filter((i) => i.status !== 'cancelada' && chave(i.pagador || i.nome) === pg)
        .map((i) => [i.id, i] as const),
    );
    return this.parcelas()
      .filter((p) => !p.movimento_id && doPagador.has(p.inscricao_id))
      .map((p) => ({ parcela: p, inscricao: doPagador.get(p.inscricao_id)! }))
      .sort(
        (a, b) =>
          a.parcela.vencimento.localeCompare(b.parcela.vencimento) ||
          a.inscricao.nome.localeCompare(b.inscricao.nome),
      );
  });

  protected readonly selecionadas = computed(() =>
    this.abertasDoPagador().filter((x) => !this.desmarcadas().has(x.parcela.id)),
  );

  protected readonly totalSelecionado = computed(() =>
    this.selecionadas().reduce((t, x) => t + Number(x.parcela.valor), 0),
  );

  protected readonly confirmando = signal(false);
  protected readonly resultado = signal<string | null>(null);

  protected escolherPagador(valor: string): void {
    this.pagador.set(valor);
    this.confirmando.set(false);
    this.resultado.set(null);
    this.desmarcadas.set(new Set());
    this.comprovante.set(null);
    this.reciboConjunto.set(null);
  }

  protected marcar(id: string, evento: Event): void {
    const s = new Set(this.desmarcadas());
    if ((evento.target as HTMLInputElement).checked) s.delete(id);
    else s.add(id);
    this.desmarcadas.set(s);
    this.confirmando.set(false);
  }

  protected cobrarTudo(): string {
    const itens = this.selecionadas();
    return linkWhatsapp(telefoneCobranca(itens[0].inscricao), textoCobrancaPagador(itens));
  }

  /** Dá baixa em todas as parcelas marcadas e liga o mesmo comprovante a todas. */
  protected async receberTudo(): Promise<void> {
    const itens = this.selecionadas();
    if (!itens.length) return;
    // Confirmação na própria tela: confirm() pode estar bloqueado pelo navegador e aí não acontece nada.
    if (!this.confirmando()) {
      this.confirmando.set(true);
      return;
    }
    this.confirmando.set(false);
    this.resultado.set(null);
    this.ocupado.set(true);
    const pagas: typeof itens = [];
    const avisos: string[] = [];
    try {
      for (const x of itens) {
        try {
          await this.supabase.pagarParcela(x.parcela.id, this.forma(), this.dataPagamento());
          pagas.push(x);
        } catch (e) {
          // Já paga em outra aba: segue com as demais.
          if (!String((e as { message?: string })?.message ?? '').includes('PARCELA_JA_PAGA')) throw e;
        }
      }
    } catch (e) {
      const m = String((e as { message?: string })?.message ?? '');
      avisos.push(`Não foi possível dar baixa em todas: ${pagas.length} de ${itens.length} foram baixadas.${m ? ` (${m})` : ''}`);
    }
    const arquivo = this.comprovante();
    if (arquivo && pagas.length) {
      try {
        await this.supabase.anexarComprovanteEmVarias(pagas.map((x) => x.parcela.id), arquivo);
      } catch {
        avisos.push('O comprovante não foi enviado. Anexe pela aba Carnês.');
      }
    }
    if (pagas.length) {
      this.reciboConjunto.set(
        linkWhatsapp(telefoneCobranca(pagas[0].inscricao), textoReciboPagador(pagas, this.dataPagamento())),
      );
    }
    if (pagas.length && !avisos.length) avisos.push(`Baixa feita em ${pagas.length} parcela(s).`);
    this.resultado.set(avisos.join(' '));
    this.comprovante.set(null);
    this.desmarcadas.set(new Set());
    this.ocupado.set(false);
    this.alterado.emit();
  }

  protected escolherArquivo(evento: Event): File | null {
    return (evento.target as HTMLInputElement).files?.[0] ?? null;
  }

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

  protected cobrar(p: Parcela, i: Inscricao): string {
    return linkWhatsapp(telefoneCobranca(i), textoCobranca(p, i));
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
