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
  if (v === 'masculino') return 'Masculino';
  if (v === 'feminino') return 'Feminino';
  if (v === 'avista') return 'À vista';
  if (v === 'carne') return 'Carnê';
  return v ?? '';
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
