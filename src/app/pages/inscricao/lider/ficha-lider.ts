import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Pagamento } from '../../../core/pagamento';
import { Supabase } from '../../../core/supabase';
import { calcularIdade, cpf, dataBr, lerDataBr, mascaras, nomeCompleto, telefone } from '../validadores';

/** O apoio precisa ter pelo menos 14 anos. */
const idadeMinima = (c: AbstractControl<string>): ValidationErrors | null => {
  const data = lerDataBr(c.value);
  return data && calcularIdade(data) < 14 ? { idadeMinima: true } : null;
};

type Mascara = keyof typeof mascaras;

/** Área de apoio: pelo menos um dos dois campos precisa ser preenchido. */
const umaArea = (g: AbstractControl): ValidationErrors | null =>
  g.get('area')?.value.trim() || g.get('areaOutra')?.value.trim() ? null : { semArea: true };

/**
 * Ficha do apoio (líder), aberta pelo link de líder. Mais curta que a do participante e com a
 * área de apoio. As chaves de `dados` seguem as da ficha do participante onde a pergunta é a mesma
 * (pessoais, saude, imagem), para o admin agrupar tudo junto.
 */
@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-ficha-lider',
  styleUrl: '../inscricao.scss',
  templateUrl: './ficha-lider.html',
})
export class FichaLider {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly supabase = inject(Supabase);
  private readonly pagamento = inject(Pagamento);
  private readonly destroyRef = inject(DestroyRef);

  readonly token = input.required<string>();
  /** Link de modo checkout: depois da ficha, segue para o pagamento online. */
  readonly checkout = input(false);
  /** Nome de quem enviou, para a tela de agradecimento. */
  readonly enviada = output<string>();
  /** O banco recusou o link (já usado ou cancelado). */
  readonly linkInvalido = output();

  protected readonly etapas = [
    { id: 'pessoais', titulo: 'Dados do apoio' },
    { id: 'saude', titulo: 'Informações de saúde' },
    { id: 'imagem', titulo: 'Autorização de imagem' },
    { id: 'apoio', titulo: 'Área de apoio' },
    { id: 'observacoes', titulo: 'Observações' },
  ] as const;

  protected readonly form = this.fb.group({
    pessoais: this.fb.group({
      nome: ['', [Validators.required, nomeCompleto]],
      genero: ['', Validators.required],
      nascimento: ['', [Validators.required, dataBr, idadeMinima]],
      idade: [{ value: '', disabled: true }],
      cpf: ['', [Validators.required, cpf]],
      telefone: ['', [Validators.required, telefone]],
    }),
    saude: this.fb.group({
      alergia: ['', Validators.required],
      alergiaQual: [{ value: '', disabled: true }],
      restricao: ['', Validators.required],
      restricaoQual: [{ value: '', disabled: true }],
    }),
    imagem: this.fb.group({ autoriza: ['', Validators.required] }),
    apoio: this.fb.group({ area: [''], areaOutra: [''] }, { validators: umaArea }),
    observacoes: this.fb.group({
      info: [''],
      declaracao: [false, Validators.requiredTrue],
      consentimento: [false, Validators.requiredTrue],
    }),
  });

  protected readonly etapa = signal(0);
  protected readonly enviando = signal(false);
  protected readonly erroEnvio = signal<string | null>(null);

  constructor() {
    // "Qual?" só aparece (e vira obrigatório) quando a resposta não é "Não".
    const saude = this.form.controls.saude.controls;
    this.ligarDetalhe(saude.alergia, saude.alergiaQual);
    this.ligarDetalhe(saude.restricao, saude.restricaoQual);

    // Idade calculada pela data de nascimento (só leitura; vai em `dados` pelo getRawValue).
    const pessoais = this.form.controls.pessoais.controls;
    pessoais.nascimento.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
      const data = pessoais.nascimento.valid ? lerDataBr(v) : null;
      pessoais.idade.setValue(data ? `${calcularIdade(data)} anos` : '');
    });
  }

  private ligarDetalhe(resposta: AbstractControl<string>, detalhe: AbstractControl<string>): void {
    resposta.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
      if (v && v !== 'nao') {
        detalhe.setValidators(Validators.required);
        detalhe.enable();
      } else {
        detalhe.clearValidators();
        detalhe.reset();
        detalhe.disable();
      }
    });
  }

  protected campo(grupo: string, nome: string): AbstractControl {
    return this.form.get([grupo, nome])!;
  }

  protected invalido(grupo: string, nome: string): boolean {
    const c = this.campo(grupo, nome);
    return c.invalid && c.touched;
  }

  protected erro(grupo: string, nome: string): string {
    const e = this.campo(grupo, nome).errors ?? {};
    if (e['required']) return 'Campo obrigatório.';
    if (e['nomeCompleto']) return 'Informe nome e sobrenome, apenas com letras.';
    if (e['dataInvalida']) return 'Data inválida. Use o formato dd/mm/aaaa.';
    if (e['dataFutura']) return 'A data de nascimento não pode estar no futuro.';
    if (e['idadeMinima']) return 'O apoio precisa ter pelo menos 14 anos.';
    if (e['cpf']) return 'CPF inválido.';
    if (e['telefone']) return 'Telefone inválido. Use DDD + número, ex.: (11) 91234-5678.';
    return '';
  }

  protected semArea(): boolean {
    const g = this.form.controls.apoio;
    return g.hasError('semArea') && g.touched;
  }

  protected mascarar(evento: Event, grupo: string, nome: string, tipo: Mascara): void {
    const el = evento.target as HTMLInputElement;
    el.value = mascaras[tipo](el.value);
    this.campo(grupo, nome).setValue(el.value);
  }

  protected irPara(i: number): void {
    for (let anterior = 0; anterior < i; anterior++) {
      const g = this.form.get(this.etapas[anterior].id)!;
      if (g.invalid) {
        g.markAllAsTouched();
        this.etapa.set(anterior);
        return this.rolarParaTopo();
      }
    }
    this.etapa.set(i);
    this.rolarParaTopo();
  }

  protected async avancar(): Promise<void> {
    const grupo = this.form.get(this.etapas[this.etapa()].id) as FormGroup;
    if (grupo.invalid) {
      grupo.markAllAsTouched();
      return;
    }
    if (this.etapa() < this.etapas.length - 1) return this.irPara(this.etapa() + 1);

    this.enviando.set(true);
    this.erroEnvio.set(null);
    try {
      const dados = this.form.getRawValue();
      const id = await this.supabase.enviarInscricao(dados, this.token());
      // Mantém o botão em "enviando" enquanto o navegador troca para o checkout (mesma aba).
      if (this.checkout() && (await this.pagamento.irParaCheckout(id))) return;
      this.enviando.set(false);
      this.enviada.emit(dados.pessoais.nome);
    } catch (e) {
      const msg = String((e as { message?: string })?.message);
      if (msg.includes('CONVITE_INVALIDO')) return this.linkInvalido.emit();
      this.erroEnvio.set(
        msg.includes('INSCRICOES_ENCERRADAS')
          ? 'As vagas de apoio estão encerradas no momento. Fale com a liderança.'
          : 'Não foi possível enviar a ficha. Verifique sua internet e tente novamente.',
      );
      this.enviando.set(false);
    }
  }

  protected voltar(): void {
    this.irPara(this.etapa() - 1);
  }

  private rolarParaTopo(): void {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
