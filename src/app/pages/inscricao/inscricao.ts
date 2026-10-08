import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ModoConvite, Supabase, TipoInscricao } from '../../core/supabase';
import {
  calcularIdade,
  cpf,
  dataBr,
  lerDataBr,
  mascaras,
  diferenteDoParticipante,
  nomeCompleto,
  telefone,
} from './validadores';

/** Pergunta de sim/não que libera (e torna obrigatório) um campo de detalhe quando a resposta é "sim". */
interface PerguntaSimNao {
  campo: string;
  texto: string;
  detalhe?: { campo: string; rotulo: string };
}

type Mascara = keyof typeof mascaras;

@Component({
  imports: [NgTemplateOutlet, ReactiveFormsModule, RouterLink],
  selector: 'app-inscricao',
  styleUrl: './inscricao.scss',
  templateUrl: './inscricao.html',
})
export class Inscricao {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly supabase = inject(Supabase);

  protected readonly etapas = [
    { id: 'pessoais', titulo: 'Dados pessoais' },
    { id: 'saude', titulo: 'Saúde e bem-estar' },
    { id: 'responsavel', titulo: 'Responsável e emergência' },
    { id: 'igreja', titulo: 'Vida cristã e igreja' },
    { id: 'imagem', titulo: 'Autorização de imagem' },
    { id: 'expectativas', titulo: 'Expectativas' },
  ] as const;

  protected readonly perguntasSaude: PerguntaSimNao[] = [
    {
      campo: 'doenca',
      texto: 'Você possui alguma doença ou condição de saúde que a liderança deva saber?',
      detalhe: { campo: 'doencaQual', rotulo: 'Qual?' },
    },
    {
      campo: 'crises',
      texto: 'Você já teve crises de ansiedade, ataques de pânico ou desmaios?',
      detalhe: { campo: 'crisesDetalhe', rotulo: 'Explique brevemente' },
    },
    {
      campo: 'restricao',
      texto: 'Você possui alguma restrição alimentar?',
      detalhe: { campo: 'restricaoQual', rotulo: 'Qual?' },
    },
    {
      campo: 'alergia',
      texto: 'Você possui alguma alergia?',
      detalhe: { campo: 'alergiaQual', rotulo: 'Qual?' },
    },
    {
      campo: 'medicamento',
      texto: 'Você faz uso periódico de algum medicamento?',
      detalhe: { campo: 'medicamentoQual', rotulo: 'Qual medicamento utiliza?' },
    },
    {
      campo: 'acompanhamento',
      texto: 'Você possui acompanhamento psicológico ou psiquiátrico atualmente?',
    },
  ];

  protected readonly perguntasIgreja: PerguntaSimNao[] = [
    { campo: 'emanuel', texto: 'Você é da Igreja Cristã Emanuel Moriyah?' },
    {
      campo: 'frequenta',
      texto: 'Você frequenta alguma igreja atualmente?',
      detalhe: { campo: 'igrejaQual', rotulo: 'Qual igreja?' },
    },
    {
      campo: 'retiro',
      texto: 'Você já participou de algum retiro ou acampamento cristão?',
      detalhe: { campo: 'retiroQual', rotulo: 'Qual?' },
    },
    {
      campo: 'ministerio',
      texto: 'Você serve em algum ministério na igreja?',
      detalhe: { campo: 'ministerioQual', rotulo: 'Qual ministério?' },
    },
    { campo: 'batizado', texto: 'Você é batizado nas águas?' },
  ];

  protected readonly form = this.fb.group({
    pessoais: this.fb.group({
      nome: ['', [Validators.required, nomeCompleto]],
      genero: ['', Validators.required],
      nascimento: ['', [Validators.required, dataBr]],
      idade: [{ value: '', disabled: true }],
      cpf: ['', [Validators.required, cpf]],
      telefone: ['', [Validators.required, telefone]],
      email: ['', [Validators.required, Validators.email]],
    }),
    saude: this.grupoSimNao(this.perguntasSaude, { outrasInfo: [''] }),
    responsavel: this.fb.group({
      nome: ['', [Validators.required, nomeCompleto, diferenteDoParticipante('pessoais.nome', 'nome')]],
      telefone: ['', [Validators.required, telefone, diferenteDoParticipante('pessoais.telefone', 'telefone')]],
      emergencia1: ['', [Validators.required, telefone]],
      emergencia2: ['', [telefone]],
    }),
    igreja: this.grupoSimNao(this.perguntasIgreja),
    imagem: this.fb.group({ autoriza: ['', Validators.required] }),
    expectativas: this.fb.group({
      espera: ['', [Validators.required, Validators.minLength(3)]],
      compartilhar: [''],
      declaracao: [false, Validators.requiredTrue],
      consentimento: [false, Validators.requiredTrue],
    }),
  });

  /**
   * Link de inscrição gerado pelo admin (`/inscricao?convite=<token>`). Tipo (participante/líder)
   * e modo vêm do banco, não do link: 'carne' grava sem pagamento no site; 'checkout' segue para o
   * pagamento online, como a inscrição pública.
   */
  private readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('convite');
  protected readonly convite = signal<
    'nenhum' | 'verificando' | 'invalido' | { tipo: TipoInscricao; modo: ModoConvite }
  >(this.token ? 'verificando' : 'nenhum');
  private readonly dadosConvite = computed(() => {
    const c = this.convite();
    return typeof c === 'object' ? c : null;
  });
  protected readonly viaConvite = computed(() => this.dadosConvite() !== null);
  protected readonly lider = computed(() => this.dadosConvite()?.tipo === 'lider');
  protected readonly carne = computed(() => this.dadosConvite()?.modo === 'carne');

  protected readonly etapa = signal(0);
  protected readonly enviada = signal(false);
  protected readonly enviando = signal(false);
  protected readonly erroEnvio = signal<string | null>(null);
  protected readonly idade = signal<number | null>(null);

  constructor() {
    const nascimento = this.form.controls.pessoais.controls.nascimento;
    nascimento.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const data = nascimento.valid ? lerDataBr(nascimento.value) : null;
      const idade = data ? calcularIdade(data) : null;
      this.idade.set(idade);
      this.form.controls.pessoais.controls.idade.setValue(idade === null ? '' : `${idade} anos`);
    });

    // Responsável é comparado com o participante: se o participante mudar, revalida.
    const { pessoais, responsavel } = this.form.controls;
    pessoais.controls.nome.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => responsavel.controls.nome.updateValueAndValidity());
    pessoais.controls.telefone.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => responsavel.controls.telefone.updateValueAndValidity());

    // Quem é da Emanuel Moriyah não precisa dizer que igreja frequenta.
    const igreja = this.form.controls.igreja.controls;
    const frequenta = igreja['frequenta'];
    frequenta.disable();
    igreja['emanuel'].valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      if (v === 'nao') {
        frequenta.enable();
      } else {
        frequenta.reset(); // limpa também o "Qual igreja?" ligado a ela
        frequenta.disable();
      }
    });

    // O Supabase só existe no navegador; a página em si é pré-renderizada.
    if (this.token) {
      afterNextRender(() => {
        this.supabase
          .lerConvite(this.token!)
          .then((c) => this.convite.set(c ?? 'invalido'))
          .catch(() => this.convite.set('invalido'));
      });
    }
  }

  /** Cria o grupo de perguntas sim/não e liga a obrigatoriedade dos campos de detalhe. */
  private grupoSimNao(perguntas: PerguntaSimNao[], extras: Record<string, [string]> = {}) {
    const grupo = new FormGroup<Record<string, FormControl<string>>>({});
    for (const p of perguntas) {
      const resposta = this.fb.control('', Validators.required);
      grupo.addControl(p.campo, resposta);
      if (!p.detalhe) continue;
      const detalhe = this.fb.control({ value: '', disabled: true });
      grupo.addControl(p.detalhe.campo, detalhe);
      resposta.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
        if (v === 'sim') {
          detalhe.setValidators(Validators.required);
          detalhe.enable();
        } else {
          detalhe.clearValidators();
          detalhe.reset();
          detalhe.disable();
        }
      });
    }
    for (const [nome, [valor]] of Object.entries(extras)) {
      grupo.addControl(nome, this.fb.control(valor));
    }
    return grupo;
  }

  protected grupoAtual(): FormGroup {
    return this.form.get(this.etapas[this.etapa()].id) as FormGroup;
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
    if (e['cpf']) return 'CPF inválido.';
    if (e['telefone']) return 'Telefone inválido. Use DDD + número, ex.: (11) 91234-5678.';
    if (e['email']) return 'E-mail inválido.';
    if (e['minlength']) return 'Escreva um pouco mais.';
    if (e['mesmoNome']) return 'O responsável precisa ser outra pessoa, não o próprio acampante.';
    if (e['mesmoTelefone']) return 'Informe um telefone do responsável diferente do telefone do acampante.';
    return '';
  }

  protected mascarar(evento: Event, grupo: string, nome: string, tipo: Mascara): void {
    const input = evento.target as HTMLInputElement;
    const valor = mascaras[tipo](input.value);
    input.value = valor;
    this.campo(grupo, nome).setValue(valor);
  }

  protected irPara(i: number): void {
    // Só deixa pular para frente se as etapas anteriores estiverem válidas.
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
    const grupo = this.grupoAtual();
    if (grupo.invalid) {
      grupo.markAllAsTouched();
      queueMicrotask(() => document.querySelector<HTMLElement>('.ng-invalid.ng-touched:not(form, fieldset, [formgroupname])')?.focus());
      return;
    }
    if (this.etapa() < this.etapas.length - 1) {
      this.irPara(this.etapa() + 1);
    } else {
      this.enviando.set(true);
      this.erroEnvio.set(null);
      try {
        await this.supabase.enviarInscricao(this.form.getRawValue(), this.viaConvite() ? this.token : null);
        // TODO: quem não é carnê (site ou link de líder) vai para o checkout do InfinitePay aqui.
        this.enviada.set(true);
        this.rolarParaTopo();
      } catch (e) {
        const msg = String((e as { message?: string })?.message);
        const encerradas = msg.includes('INSCRICOES_ENCERRADAS');
        if (msg.includes('CONVITE_INVALIDO')) this.convite.set('invalido');
        this.erroEnvio.set(
          encerradas
            ? 'As vagas do lote atual acabaram. Aguarde a abertura do próximo lote.'
            : 'Não foi possível enviar a ficha. Verifique sua internet e tente novamente.',
        );
      } finally {
        this.enviando.set(false);
      }
    }
  }

  protected voltar(): void {
    this.irPara(this.etapa() - 1);
  }

  private rolarParaTopo(): void {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
