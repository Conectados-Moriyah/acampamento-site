import { Component, computed, input } from '@angular/core';
import { SAUDE, respostaIgreja } from '../../../core/campos';
import { Inscricao } from '../../../core/supabase';

interface Contagem { rotulo: string; total: number }
interface Pessoa { nome: string; detalhe: string; telefone: string }

function contar(lista: Inscricao[], chave: (i: Inscricao) => string): Contagem[] {
  const mapa = new Map<string, number>();
  for (const i of lista) mapa.set(chave(i), (mapa.get(chave(i)) ?? 0) + 1);
  return [...mapa].map(([rotulo, total]) => ({ rotulo, total })).sort((a, b) => b.total - a.total);
}

function faixaEtaria(i: Inscricao): string {
  const idade = parseInt(i.dados['pessoais']?.['idade'] ?? '', 10);
  if (Number.isNaN(idade)) return 'Sem idade';
  if (idade < 12) return 'Menos de 12';
  if (idade < 15) return '12 a 14';
  if (idade < 18) return '15 a 17';
  if (idade < 25) return '18 a 24';
  return '25 ou mais';
}

const simNao = (v: string | undefined) => (v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : 'Sem resposta');

@Component({
  selector: 'app-resumo',
  styleUrl: './resumo.scss',
  templateUrl: './resumo.html',
})
export class Resumo {
  readonly inscricoes = input.required<Inscricao[]>();

  /** Canceladas ficam de fora: o resumo serve para organizar quem vai. */
  private readonly ativas = computed(() => this.inscricoes().filter((i) => i.status !== 'cancelada'));

  protected readonly total = computed(() => this.ativas().length);

  protected readonly grupos = computed(() => {
    const a = this.ativas();
    return [
      { titulo: 'Gênero', itens: contar(a, (i) => (i.genero === 'masculino' ? 'Masculino' : i.genero === 'feminino' ? 'Feminino' : 'Não informado')) },
      { titulo: 'Faixa etária', itens: contar(a, faixaEtaria) },
      { titulo: 'Tipo', itens: contar(a, (i) => (i.tipo === 'lider' ? 'Líder' : 'Participante')) },
      { titulo: 'Status', itens: contar(a, (i) => i.status) },
      { titulo: 'Lote', itens: contar(a, (i) => (i.lote_numero ? `${i.lote_numero}º lote` : 'Sem lote')) },
      { titulo: 'Batizados', itens: contar(a, (i) => simNao(i.dados['igreja']?.['batizado'])) },
      { titulo: 'Autoriza imagem', itens: contar(a, (i) => simNao(i.dados['imagem']?.['autoriza'])) },
      { titulo: 'Da Emanuel Moriyah', itens: contar(a, (i) => simNao(i.dados['igreja']?.['emanuel'])) },
      { titulo: 'Frequenta igreja', itens: contar(a, (i) => simNao(respostaIgreja(i.dados['igreja'], 'frequenta'))) },
    ];
  });

  /** Para cada pergunta de saúde, quem respondeu "sim" e o que detalhou. */
  protected readonly saude = computed(() => {
    const a = this.ativas();
    const listas = SAUDE.map((q) => ({
      titulo: q.titulo,
      pessoas: a
        .filter((i) => i.dados['saude']?.[q.campo] === 'sim')
        .map((i) => this.pessoa(i, q.detalhe ? i.dados['saude']?.[q.detalhe] : '')),
    }));
    listas.push({
      titulo: 'Outras informações de saúde',
      pessoas: a
        .filter((i) => i.dados['saude']?.['outrasInfo']?.trim())
        .map((i) => this.pessoa(i, i.dados['saude']['outrasInfo'])),
    });
    return listas;
  });

  /** Menores de 18: precisam entregar o termo de autorização. */
  protected readonly menores = computed(() =>
    this.ativas()
      .filter((i) => parseInt(i.dados['pessoais']?.['idade'] ?? '', 10) < 18)
      .map((i) => this.pessoa(i, i.dados['pessoais']['idade'])),
  );

  private pessoa(i: Inscricao, detalhe = ''): Pessoa {
    return { nome: i.nome, detalhe, telefone: i.telefone };
  }

  protected porcentagem(n: number): number {
    return this.total() ? Math.round((n / this.total()) * 100) : 0;
  }
}
