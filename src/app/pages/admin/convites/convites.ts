import { Component, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Convite, Inscricao, ModoConvite, Supabase, TipoInscricao } from '../../../core/supabase';

type Situacao = 'aguardando' | 'usado' | 'cancelado';

@Component({
  imports: [DatePipe],
  selector: 'app-convites',
  styleUrl: './convites.scss',
  templateUrl: './convites.html',
})
export class ConvitesPage {
  private readonly supabase = inject(Supabase);

  readonly convites = input.required<Convite[]>();
  readonly inscricoes = input.required<Inscricao[]>();
  /** carne: aba Carnês; checkout: inscrição de líder que paga online. */
  readonly modo = input.required<ModoConvite>();
  /** Quando definido, esconde a escolha de tipo (ex.: links de líder). */
  readonly tipoFixo = input<TipoInscricao>();
  readonly alterado = output();

  protected readonly tipoEscolhido = signal<TipoInscricao>('participante');
  protected readonly tipo = computed(() => this.tipoFixo() ?? this.tipoEscolhido());
  private readonly doModo = computed(() =>
    this.convites().filter((c) => c.modo === this.modo() && (!this.tipoFixo() || c.tipo === this.tipoFixo())),
  );
  protected readonly observacao = signal('');
  protected readonly gerando = signal(false);
  protected readonly novo = signal<Convite | null>(null);
  protected readonly copiado = signal<string | null>(null);
  protected readonly mostrarTodos = signal(false);

  private readonly nomes = computed(() => new Map(this.inscricoes().map((i) => [i.id, i.nome])));

  /** Por padrão só os que aguardam preenchimento. */
  protected readonly lista = computed(() =>
    this.mostrarTodos() ? this.doModo() : this.doModo().filter((c) => this.situacao(c) === 'aguardando'),
  );

  protected situacao(c: Convite): Situacao {
    if (c.usado_em) return 'usado';
    return c.cancelado ? 'cancelado' : 'aguardando';
  }

  protected nome(id: string | null): string {
    return id ? (this.nomes().get(id) ?? '') : '';
  }

  protected link(c: Convite): string {
    return `${location.origin}/inscricao?convite=${c.token}`;
  }

  protected whatsapp(c: Convite): string {
    const quem = c.tipo === 'lider' ? 'de líder ' : '';
    const texto = `Olá! Segue o link para a sua ficha de inscrição ${quem}no Acampamento Jovem Conectados ${c.modo === 'carne' ? '(pagamento via carnê)' : '(ao final você escolhe a forma de pagamento)'}: ${this.link(c)}`;
    return `https://wa.me/?text=${encodeURIComponent(texto)}`;
  }

  protected async gerar(): Promise<void> {
    this.gerando.set(true);
    try {
      const c = await this.supabase.criarConvite(this.tipo(), this.modo(), this.observacao());
      this.novo.set(c);
      this.observacao.set('');
      this.alterado.emit();
    } catch {
      alert('Não foi possível gerar o link.');
    } finally {
      this.gerando.set(false);
    }
  }

  protected async copiar(c: Convite): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link(c));
      this.copiado.set(c.token);
      setTimeout(() => this.copiado.set(null), 2000);
    } catch {
      prompt('Copie o link:', this.link(c));
    }
  }

  protected async cancelar(c: Convite): Promise<void> {
    if (!confirm('Cancelar este link? Quem o recebeu não conseguirá mais se inscrever por ele.')) return;
    try {
      await this.supabase.cancelarConvite(c.token);
      if (this.novo()?.token === c.token) this.novo.set(null);
      this.alterado.emit();
    } catch {
      alert('Não foi possível cancelar o link.');
    }
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
