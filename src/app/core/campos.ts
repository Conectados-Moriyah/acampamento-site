/** Rótulos legíveis dos campos da ficha (`dados.<etapa>.<campo>`), na ordem do formulário. */
export const ETAPAS: { id: string; titulo: string; campos: Record<string, string> }[] = [
  {
    id: 'pessoais',
    titulo: 'Dados pessoais',
    campos: {
      nome: 'Nome',
      genero: 'Gênero',
      nascimento: 'Nascimento',
      idade: 'Idade',
      cpf: 'CPF',
      telefone: 'Telefone',
      email: 'E-mail',
      conhecido: 'Tem conhecido inscrito',
      conhecidos: 'Conhecidos inscritos',
    },
  },
  {
    id: 'saude',
    titulo: 'Saúde',
    campos: {
      doenca: 'Doença/condição',
      doencaQual: 'Qual doença',
      crises: 'Crises (ansiedade/pânico/desmaio)',
      crisesDetalhe: 'Detalhe das crises',
      restricao: 'Restrição alimentar',
      restricaoQual: 'Qual restrição',
      alergia: 'Alergia',
      alergiaQual: 'Qual alergia',
      medicamento: 'Medicamento',
      medicamentoQual: 'Qual medicamento',
      acompanhamento: 'Acompanhamento psicológico',
      outrasInfo: 'Outras informações',
    },
  },
  {
    id: 'responsavel',
    titulo: 'Responsável',
    campos: {
      nome: 'Responsável',
      telefone: 'Telefone do responsável',
      emergencia1: 'Emergência 1',
      emergencia2: 'Emergência 2',
    },
  },
  {
    id: 'igreja',
    titulo: 'Igreja',
    campos: {
      emanuel: 'É da Emanuel Moriyah',
      frequenta: 'Frequenta igreja',
      igrejaQual: 'Qual igreja',
      retiro: 'Já foi a retiro',
      retiroQual: 'Qual retiro',
      ministerio: 'Serve em ministério',
      ministerioQual: 'Qual ministério',
      batizado: 'Batizado',
    },
  },
  { id: 'imagem', titulo: 'Imagem', campos: { autoriza: 'Autoriza imagem' } },
  {
    id: 'expectativas',
    titulo: 'Expectativas',
    campos: {
      espera: 'O que espera',
      compartilhar: 'Quer compartilhar',
      declaracao: 'Declarou veracidade',
      consentimento: 'Aceitou termo de consentimento',
    },
  },
  // Só na ficha de líder (apoio).
  { id: 'apoio', titulo: 'Área de apoio', campos: { area: 'Área de apoio', areaOutra: 'Área (se não definida)' } },
  {
    id: 'observacoes',
    titulo: 'Observações',
    campos: {
      info: 'Informações importantes',
      declaracao: 'Declarou veracidade',
      consentimento: 'Aceitou termo de consentimento',
    },
  },
];

/** Perguntas de saúde com resposta sim/não e o campo que detalha o "sim". */
export const SAUDE: { campo: string; detalhe?: string; titulo: string }[] = [
  { campo: 'doenca', detalhe: 'doencaQual', titulo: 'Doenças/condições' },
  { campo: 'alergia', detalhe: 'alergiaQual', titulo: 'Alergias' },
  { campo: 'restricao', detalhe: 'restricaoQual', titulo: 'Restrições alimentares' },
  { campo: 'medicamento', detalhe: 'medicamentoQual', titulo: 'Medicamentos' },
  { campo: 'crises', detalhe: 'crisesDetalhe', titulo: 'Crises de ansiedade/pânico/desmaio' },
  { campo: 'acompanhamento', titulo: 'Acompanhamento psicológico/psiquiátrico' },
];

/** Texto legível de uma resposta da ficha (sim/não, gênero, checkboxes). */
export function textoValor(v: string | boolean | undefined): string {
  if (v === true) return 'Sim';
  if (v === false) return 'Não';
  if (v === 'sim') return 'Sim';
  if (v === 'nao') return 'Não';
  if (v === 'outra') return 'Outra';
  if (v === 'masculino') return 'Masculino';
  if (v === 'feminino') return 'Feminino';
  if (v === 'amigo') return 'Amigo';
  if (v === 'parente') return 'Parente';
  if (v === 'namorado') return 'Namorado(a)';
  if (v === 'avista') return 'À vista';
  if (v === 'carne') return 'Carnê';
  return v ?? '';
}

export type TipoConhecido = 'amigo' | 'parente' | 'namorado';

/** Pessoa inscrita que o inscrito conhece (`dados.pessoais.conhecidos`). */
export interface Conhecido {
  tipo: TipoConhecido | '';
  nome: string;
  /** Só para parente (ex.: irmã, primo). */
  parentesco: string;
}

/**
 * Lista de conhecidos de uma ficha. Fichas antigas guardavam um só, em campos soltos
 * (`conhecidoTipo`, `conhecidoNome`, `conhecidoParentesco`), e às vezes com "Parente" maiúsculo.
 */
export function lerConhecidos(pessoais: Record<string, unknown> | undefined): Conhecido[] {
  const lista = pessoais?.['conhecidos'];
  if (Array.isArray(lista)) return lista as Conhecido[];
  const tipo = String(pessoais?.['conhecidoTipo'] ?? '').trim().toLowerCase() as TipoConhecido;
  const nome = String(pessoais?.['conhecidoNome'] ?? '').trim();
  if (!tipo && !nome) return [];
  return [{ tipo, nome, parentesco: String(pessoais?.['conhecidoParentesco'] ?? '').trim() }];
}

/** Ex.: "Parente (irmã): Ana Souza; Namorado(a): João Lima". */
export function textoConhecidos(lista: Conhecido[]): string {
  return lista
    .map((c) => `${textoValor(c.tipo) || '?'}${c.parentesco ? ` (${c.parentesco})` : ''}: ${c.nome}`)
    .join('; ');
}

/**
 * Quem é da Emanuel Moriyah não responde "Frequenta igreja?" (a ficha esconde a pergunta),
 * mas frequenta: a igreja é a própria Emanuel Moriyah.
 */
export function respostaIgreja(igreja: Record<string, string> | undefined, campo: string): string | undefined {
  if (igreja?.['emanuel'] === 'sim') {
    if (campo === 'frequenta') return 'sim';
    if (campo === 'igrejaQual') return 'Igreja Cristã Emanuel Moriyah';
  }
  return igreja?.[campo];
}
