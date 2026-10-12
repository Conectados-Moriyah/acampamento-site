import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ETAPAS, textoValor } from '../../../core/campos';
import { Dados, Inscricao, Supabase } from '../../../core/supabase';

/** Campos da ficha respondidos com sim/não (viram um select no editor). */
const SIM_NAO = new Set([
  'doenca', 'crises', 'restricao', 'alergia', 'medicamento', 'acompanhamento',
  'emanuel', 'frequenta', 'retiro', 'ministerio', 'batizado', 'autoriza', 'conhecido',
]);

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-editar-inscricao',
  styleUrl: './editar.scss',
  templateUrl: './editar.html',
  host: { '(document:keydown.escape)': 'fechar.emit()' },
})
export class EditarInscricao implements OnInit {
  private readonly supabase = inject(Supabase);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly inscricao = input.required<Inscricao>();
  /** Modo "visualizar": mostra todos os dados, sem permitir alteração. */
  readonly somenteLeitura = input(false);
  /** Para sugerir o nome do amigo/parente entre os inscritos. */
  readonly inscricoes = input<Inscricao[]>([]);
  protected readonly outrosInscritos = computed(() =>
    this.inscricoes()
      .filter((i) => i.status !== 'cancelada' && i.id !== this.inscricao().id)
      .map((i) => i.nome)
      .filter((nome, idx, lista) => lista.indexOf(nome) === idx)
      .sort((a, b) => a.localeCompare(b)),
  );
  protected readonly sugerindo = signal(false);
  protected readonly busca = signal('');
  protected readonly sugestoes = computed(() => {
    const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const b = sem(this.busca().trim());
    return this.outrosInscritos().filter((n) => !b || sem(n).includes(b));
  });

  protected escolherConhecido(etapa: string, nome: string): void {
    this.grupo(etapa).controls['conhecidoNome'].setValue(nome);
    this.busca.set(nome);
    this.sugerindo.set(false);
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }
  readonly fechar = output();
  readonly salvo = output();

  /** Só as etapas que existem na ficha dessa pessoa (a de líder é diferente da de participante). */
  protected etapas: typeof ETAPAS = [];
  protected readonly simNao = SIM_NAO;
  protected readonly textoValor = textoValor;
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly controle = this.fb.group({
    tipo: this.fb.control<Inscricao['tipo']>('participante'),
    status: this.fb.control<Inscricao['status']>('pendente'),
    forma_pagamento: this.fb.control<Inscricao['forma_pagamento']>('avista'),
    valor: this.fb.control(''),
    observacao: this.fb.control(''),
  });

  protected readonly dados = new FormGroup<Record<string, FormGroup<Record<string, FormControl<string>>>>>({});

  ngOnInit(): void {
    const i = this.inscricao();
    this.etapas = ETAPAS.filter((e) => e.id in i.dados);
    for (const etapa of this.etapas) {
      const grupo = new FormGroup<Record<string, FormControl<string>>>({});
      for (const campo of Object.keys(etapa.campos)) {
        let valor = i.dados[etapa.id]?.[campo] ?? '';
        // Edições antigas gravaram "Sim"/"Parente" à mão; as listas usam o valor da ficha ("sim"/"parente").
        if ((campo === 'conhecido' || campo === 'conhecidoTipo') && typeof valor === 'string') {
          valor = valor.trim().toLowerCase().replace('não', 'nao');
        }
        grupo.addControl(campo, this.fb.control(valor));
      }
      this.dados.addControl(etapa.id, grupo);
    }
    this.controle.setValue({
      tipo: i.tipo,
      status: i.status,
      forma_pagamento: i.forma_pagamento,
      valor: i.valor === null ? '' : String(i.valor),
      observacao: i.observacao ?? '',
    });
    if (this.somenteLeitura()) {
      this.controle.disable();
      this.dados.disable();
    }
  }

  protected async salvar(): Promise<void> {
    if (this.somenteLeitura()) return;
    const dados = this.dados.getRawValue() as Dados;
    const p = dados['pessoais'];
    if (!p['nome'].trim() || !p['telefone'].trim()) {
      this.erro.set('Nome e telefone são obrigatórios.');
      return;
    }
    const c = this.controle.getRawValue();
    const valor = c.valor.trim() === '' ? null : Number(c.valor.replace(',', '.'));
    if (valor !== null && Number.isNaN(valor)) {
      this.erro.set('Valor inválido.');
      return;
    }

    const atualTipo = this.inscricao().tipo;
    const alteracao = {
      tipo: c.tipo,
      status: c.status,
      valor,
      observacao: c.observacao.trim() || null,
      // O lote é do tipo antigo; trocar o tipo solta a inscrição do lote (a FK é por tipo + número).
      ...(atualTipo !== c.tipo ? { lote_numero: null } : {}),
      nome: p['nome'].trim(),
      telefone: p['telefone'].trim(),
      email: (p['email'] ?? '').trim(), // a ficha de líder não tem e-mail
      genero: p['genero'] || null,
      forma_pagamento: c.forma_pagamento,
      dados,
    };

    this.salvando.set(true);
    this.erro.set(null);
    try {
      await this.supabase.atualizarInscricao(this.inscricao().id, alteracao);
      this.salvo.emit();
    } catch {
      this.erro.set('Não foi possível salvar.');
    } finally {
      this.salvando.set(false);
    }
  }

  protected grupo(id: string): FormGroup {
    return this.dados.controls[id];
  }

  protected campos(etapa: (typeof ETAPAS)[number]): [string, string][] {
    return Object.entries(etapa.campos);
  }
}
