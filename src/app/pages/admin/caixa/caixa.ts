import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Caixa, Cupom, FormaPagamento, Inscricao, Movimento, Supabase } from '../../../core/supabase';

const hoje = () => new Date().toLocaleDateString('sv-SE'); // yyyy-mm-dd no fuso local

@Component({
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule],
  selector: 'app-caixa',
  styleUrl: './caixa.scss',
  templateUrl: './caixa.html',
})
export class CaixaPage {
  private readonly supabase = inject(Supabase);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly movimentos = input.required<Movimento[]>();
  readonly inscricoes = input.required<Inscricao[]>();
  readonly cupons = input.required<Cupom[]>();
  readonly alterado = output();

  protected readonly filtroCaixa = signal<Caixa | ''>('');
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly form = this.fb.group({
    tipo: this.fb.control<'entrada' | 'saida'>('entrada'),
    caixa: this.fb.control<Caixa>('inscricao'),
    data: [hoje(), Validators.required],
    valor: ['', Validators.required],
    descricao: ['', Validators.required],
    forma: this.fb.control<FormaPagamento>('pix'),
    inscricao_id: [''],
  });

  protected readonly resumo = computed(() => {
    const soma = (caixa: Caixa, tipo: 'entrada' | 'saida') =>
      this.movimentos()
        .filter((m) => m.caixa === caixa && m.tipo === tipo)
        .reduce((t, m) => t + Number(m.valor), 0);
    const reservado = this.cupons()
      .filter((c) => c.status === 'disponivel')
      .reduce((t, c) => t + Number(c.valor), 0);
    const caixa = (c: Caixa) => {
      const entradas = soma(c, 'entrada');
      const saidas = soma(c, 'saida');
      return { entradas, saidas, saldo: entradas - saidas };
    };
    const doacao = caixa('doacao');
    return {
      inscricao: caixa('inscricao'),
      doacao: { ...doacao, reservado, disponivel: doacao.saldo - reservado },
      total: caixa('inscricao').saldo + doacao.saldo,
    };
  });

  protected readonly filtrados = computed(() =>
    this.movimentos().filter((m) => !this.filtroCaixa() || m.caixa === this.filtroCaixa()),
  );

  private readonly nomes = computed(() => new Map(this.inscricoes().map((i) => [i.id, i.nome])));

  protected readonly inscricoesAtivas = computed(() =>
    this.inscricoes()
      .filter((i) => i.status !== 'cancelada')
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  );

  protected nome(id: string | null): string {
    return id ? (this.nomes().get(id) ?? '') : '';
  }

  /** Ao escolher um inscrito, já sugere a descrição. */
  protected escolherInscrito(id: string): void {
    if (id && !this.form.controls.descricao.value) {
      this.form.controls.descricao.setValue(`Inscrição — ${this.nome(id)}`);
    }
  }

  protected async salvar(): Promise<void> {
    if (this.form.invalid) return this.form.markAllAsTouched();
    const f = this.form.getRawValue();
    const valor = Number(f.valor.replace(/\./g, '').replace(',', '.'));
    if (!(valor > 0)) {
      this.erro.set('Informe um valor maior que zero.');
      return;
    }
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await this.supabase.criarMovimento({
        tipo: f.tipo,
        caixa: f.caixa,
        data: f.data,
        valor,
        descricao: f.descricao.trim(),
        forma: f.forma,
        inscricao_id: f.caixa === 'inscricao' && f.inscricao_id ? f.inscricao_id : null,
      });
      this.form.patchValue({ valor: '', descricao: '', inscricao_id: '' });
      this.form.markAsUntouched();
      this.alterado.emit();
    } catch {
      this.erro.set('Não foi possível salvar o lançamento.');
    } finally {
      this.salvando.set(false);
    }
  }

  protected async excluir(m: Movimento): Promise<void> {
    if (m.cupom_id) {
      alert('Lançamentos de cupom não podem ser excluídos por aqui.');
      return;
    }
    if (!confirm(`Excluir "${m.descricao}" (${m.tipo})?`)) return;
    try {
      await this.supabase.excluirMovimento(m.id);
      this.alterado.emit();
    } catch {
      alert('Não foi possível excluir.');
    }
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLSelectElement).value;
  }
}
