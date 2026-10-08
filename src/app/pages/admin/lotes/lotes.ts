import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Inscricao, Lote, Supabase, TipoInscricao } from '../../../core/supabase';

const chave = (tipo: TipoInscricao, numero: number) => `${tipo}-${numero}`;

@Component({
  imports: [CurrencyPipe],
  selector: 'app-lotes',
  styleUrl: './lotes.scss',
  templateUrl: './lotes.html',
})
export class Lotes {
  private readonly supabase = inject(Supabase);

  readonly lotes = input.required<Lote[]>();
  readonly inscricoes = input.required<Inscricao[]>();
  readonly alterado = output();

  protected readonly salvando = signal<string | null>(null);

  protected readonly secoes = computed(() =>
    (['participante', 'lider'] as const).map((tipo) => ({
      tipo,
      titulo: tipo === 'lider' ? 'Lotes de líderes' : 'Lotes de participantes',
      lotes: this.lotes().filter((l) => l.tipo === tipo),
    })),
  );

  /** Mesma regra do banco: inscrições não canceladas ocupam vaga no lote do seu tipo. */
  private readonly ocupadasPorLote = computed(() => {
    const mapa = new Map<string, number>();
    for (const i of this.inscricoes()) {
      if (i.status !== 'cancelada' && i.lote_numero) {
        const k = chave(i.tipo, i.lote_numero);
        mapa.set(k, (mapa.get(k) ?? 0) + 1);
      }
    }
    return mapa;
  });

  protected ocupadas(l: Lote): number {
    return this.ocupadasPorLote().get(chave(l.tipo, l.numero)) ?? 0;
  }

  protected salvandoLote(l: Lote): boolean {
    return this.salvando() === chave(l.tipo, l.numero);
  }

  protected async salvar(lote: Lote, mudanca: Partial<Lote>): Promise<void> {
    const novo = { ...lote, ...mudanca };
    if (novo.aberto && !lote.aberto && this.ocupadas(lote) >= novo.vagas) {
      if (!confirm(`O ${lote.numero}º lote já está lotado. Abrir mesmo assim? Ele fecha de novo na próxima inscrição.`)) return;
    }
    this.salvando.set(chave(lote.tipo, lote.numero));
    try {
      await this.supabase.salvarLote(novo);
      this.alterado.emit();
    } catch {
      alert('Não foi possível salvar o lote.');
    } finally {
      this.salvando.set(null);
    }
  }

  protected async novoLote(tipo: TipoInscricao, lotes: Lote[]): Promise<void> {
    const ultimo = lotes.at(-1);
    await this.salvar(
      { tipo, numero: (ultimo?.numero ?? 0) + 1, valor: ultimo?.valor ?? 0, vagas: ultimo?.vagas ?? 0, aberto: false },
      {},
    );
  }

  protected numero(evento: Event): number {
    return Number((evento.target as HTMLInputElement).value.replace(',', '.'));
  }
}
