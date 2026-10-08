import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { exportarInscricoes } from '../../../core/exportar';
import { Convite, Cupom, Inscricao, Lote, Movimento, Parcela, StatusInscricao, Supabase } from '../../../core/supabase';
import { EditarInscricao } from '../editar/editar';
import { Resumo } from '../resumo/resumo';
import { Lotes } from '../lotes/lotes';
import { CaixaPage } from '../caixa/caixa';
import { CuponsPage } from '../cupons/cupons';
import { CarnesPage } from '../carnes/carnes';
import { ConvitesPage } from '../convites/convites';

type Aba = 'lista' | 'resumo' | 'lotes' | 'carnes' | 'caixa' | 'cupons';

@Component({
  imports: [CurrencyPipe, DatePipe, EditarInscricao, Resumo, Lotes, CaixaPage, CuponsPage, CarnesPage, ConvitesPage],
  selector: 'app-admin-inscricoes',
  styleUrl: '../admin.scss',
  templateUrl: './inscricoes.html',
})
export class AdminInscricoes {
  protected readonly supabase = inject(Supabase);
  private readonly router = inject(Router);

  protected readonly itensMenu: { id: Aba; label: string }[] = [
    { id: 'lista', label: 'Inscrições' },
    { id: 'resumo', label: 'Resumo' },
    { id: 'lotes', label: 'Lotes' },
    { id: 'carnes', label: 'Carnês' },
    { id: 'caixa', label: 'Caixa' },
    { id: 'cupons', label: 'Cupons' },
  ];
  protected readonly aba = signal<Aba>('lista');
  protected readonly tituloAba = computed(() => this.itensMenu.find((i) => i.id === this.aba())!.label);
  /** Só tem efeito no celular, onde o menu lateral vira uma barra que abre e fecha. */
  protected readonly menuAberto = signal(false);
  /** Painel de links de inscrição de líder (pagam online no checkout). */
  protected readonly linksLider = signal(false);
  protected readonly inscricoes = signal<Inscricao[]>([]);
  protected readonly lotes = signal<Lote[]>([]);
  protected readonly movimentos = signal<Movimento[]>([]);
  protected readonly cupons = signal<Cupom[]>([]);
  protected readonly parcelas = signal<Parcela[]>([]);
  protected readonly convites = signal<Convite[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  /** Inscrição aberta no painel de edição. */
  protected readonly editando = signal<Inscricao | null>(null);

  protected readonly busca = signal('');
  protected readonly filtroStatus = signal<StatusInscricao | ''>('');
  protected readonly filtroTipo = signal<Inscricao['tipo'] | ''>('');

  protected readonly filtradas = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    return this.inscricoes().filter(
      (i) =>
        (!this.filtroStatus() || i.status === this.filtroStatus()) &&
        (!this.filtroTipo() || i.tipo === this.filtroTipo()) &&
        (!termo || `${i.nome} ${i.email} ${i.telefone}`.toLowerCase().includes(termo)),
    );
  });

  protected readonly totais = computed(() => {
    const ativas = this.inscricoes().filter((i) => i.status !== 'cancelada');
    return {
      ativas: ativas.length,
      confirmadas: ativas.filter((i) => i.status === 'confirmada').length,
      pendentes: ativas.filter((i) => i.status === 'pendente').length,
      lideres: ativas.filter((i) => i.tipo === 'lider').length,
    };
  });

  /** Quanto cada inscrito já pagou: entradas menos saídas (estornos) do caixa de inscrições. */
  protected readonly pagoPorInscricao = computed(() => {
    const mapa = new Map<string, number>();
    for (const m of this.movimentos()) {
      if (m.caixa === 'inscricao' && m.inscricao_id) {
        const v = (m.tipo === 'entrada' ? 1 : -1) * Number(m.valor);
        mapa.set(m.inscricao_id, (mapa.get(m.inscricao_id) ?? 0) + v);
      }
    }
    return mapa;
  });

  constructor() {
    this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    try {
      const [inscricoes, lotes, movimentos, cupons, parcelas, convites] = await Promise.all([
        this.supabase.listarInscricoes(),
        this.supabase.listarLotes(),
        this.supabase.listarMovimentos(),
        this.supabase.listarCupons(),
        this.supabase.listarParcelas(),
        this.supabase.listarConvites(),
      ]);
      this.inscricoes.set(inscricoes);
      this.lotes.set(lotes);
      this.movimentos.set(movimentos);
      this.cupons.set(cupons);
      this.parcelas.set(parcelas);
      this.convites.set(convites);
      this.erro.set(null);
    } catch {
      this.erro.set('Não foi possível carregar os dados.');
    } finally {
      this.carregando.set(false);
    }
  }

  protected async mudarStatus(i: Inscricao, status: string): Promise<void> {
    try {
      const atualizada = await this.supabase.atualizarInscricao(i.id, { status: status as StatusInscricao });
      this.substituir(atualizada);
      // Cancelar/reativar muda a ocupação; o banco pode ter fechado um lote.
      this.lotes.set(await this.supabase.listarLotes());
    } catch {
      alert('Não foi possível alterar o status.');
    }
  }

  protected substituir(atualizada: Inscricao): void {
    this.inscricoes.update((lista) => lista.map((i) => (i.id === atualizada.id ? atualizada : i)));
  }

  protected irPara(aba: Aba): void {
    this.aba.set(aba);
    this.menuAberto.set(false);
  }

  protected exportar(): void {
    exportarInscricoes(this.filtradas());
  }

  protected async sair(): Promise<void> {
    await this.supabase.sair();
    this.router.navigateByUrl('/admin/login');
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
