import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Cupom, Inscricao, Movimento, Supabase, TipoInscricao } from '../../../core/supabase';

const mensagem = (e: unknown) => String((e as { message?: string })?.message ?? '');

@Component({
  imports: [CurrencyPipe, DatePipe],
  selector: 'app-cupons',
  styleUrl: './cupons.scss',
  templateUrl: './cupons.html',
})
export class CuponsPage {
  private readonly supabase = inject(Supabase);

  readonly cupons = input.required<Cupom[]>();
  readonly movimentos = input.required<Movimento[]>();
  readonly inscricoes = input.required<Inscricao[]>();
  readonly alterado = output();

  protected readonly tipo = signal<TipoInscricao>('participante');
  protected readonly valor = signal('');
  /** Cupom cujo link acabou de ser copiado (mostra "Copiado!"). */
  protected readonly copiado = signal<string | null>(null);
  protected readonly observacao = signal('');
  protected readonly gerando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly gerado = signal<Cupom | null>(null);
  /** Cupom com o seletor de inscrito aberto. */
  protected readonly aplicando = signal<string | null>(null);

  /** Mesma conta da função doacoes_disponiveis() do banco. */
  protected readonly disponivel = computed(() => {
    const saldo = this.movimentos()
      .filter((m) => m.caixa === 'doacao')
      .reduce((t, m) => t + (m.tipo === 'entrada' ? 1 : -1) * Number(m.valor), 0);
    const reservado = this.cupons()
      .filter((c) => c.status === 'disponivel')
      .reduce((t, c) => t + Number(c.valor), 0);
    return saldo - reservado;
  });

  private readonly nomes = computed(() => new Map(this.inscricoes().map((i) => [i.id, i.nome])));

  protected readonly inscricoesAtivas = computed(() =>
    this.inscricoes()
      .filter((i) => i.status !== 'cancelada')
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  );

  protected nome(id: string | null): string {
    return id ? (this.nomes().get(id) ?? '') : '';
  }

  protected async gerar(): Promise<void> {
    const valor = Number(this.valor().replace(/\./g, '').replace(',', '.'));
    if (!(valor > 0)) {
      this.erro.set('Informe um valor maior que zero.');
      return;
    }
    if (valor > this.disponivel()) {
      this.erro.set('O valor passa do saldo de doações livre.');
      return;
    }
    this.gerando.set(true);
    this.erro.set(null);
    try {
      this.gerado.set(await this.supabase.gerarCupom(valor, this.tipo(), this.observacao()));
      this.valor.set('');
      this.observacao.set('');
      this.alterado.emit();
    } catch (e) {
      this.erro.set(
        mensagem(e).includes('SALDO_DOACOES_INSUFICIENTE')
          ? 'O valor passa do saldo de doações livre.'
          : 'Não foi possível gerar o cupom.',
      );
    } finally {
      this.gerando.set(false);
    }
  }

  protected async aplicar(cupom: Cupom, inscricaoId: string): Promise<void> {
    if (!inscricaoId) return;
    if (!confirm(`Usar o cupom ${cupom.codigo} na inscrição de ${this.nome(inscricaoId)}?`)) return;
    try {
      await this.supabase.aplicarCupom(cupom.id, inscricaoId);
      this.aplicando.set(null);
      this.alterado.emit();
    } catch (e) {
      alert(mensagem(e).includes('CUPOM_INDISPONIVEL') ? 'Esse cupom não está mais disponível.' : 'Não foi possível usar o cupom.');
    }
  }

  protected async cancelar(cupom: Cupom): Promise<void> {
    if (!confirm(`Cancelar o cupom ${cupom.codigo}? O valor volta para o saldo de doações.`)) return;
    try {
      await this.supabase.cancelarCupom(cupom.id);
      this.alterado.emit();
    } catch {
      alert('Não foi possível cancelar o cupom.');
    }
  }

  /** Link da ficha com o cupom (participante ou líder, conforme o tipo do cupom). */
  protected link(c: Cupom): string {
    return `${location.origin}/inscricao?convite=${c.convite}`;
  }

  protected whatsapp(c: Cupom): string {
    const quem = c.tipo === 'lider' ? 'de líder ' : '';
    const texto = `Olá! Segue o link para a sua ficha de inscrição ${quem}no Acampamento Jovem Conectados, com um cupom de desconto: ${this.link(c)}`;
    return `https://wa.me/?text=${encodeURIComponent(texto)}`;
  }

  protected async copiar(c: Cupom): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link(c));
      this.copiado.set(c.id);
      setTimeout(() => this.copiado.set(null), 2000);
    } catch {
      prompt('Copie o link:', this.link(c));
    }
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
