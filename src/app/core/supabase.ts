import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export type Dados = Record<string, Record<string, string>>;
export type TipoInscricao = 'participante' | 'lider';
export type StatusInscricao = 'pendente' | 'confirmada' | 'cancelada';

export interface Inscricao {
  id: string;
  criada_em: string;
  nome: string;
  telefone: string;
  email: string;
  genero: string | null;
  tipo: TipoInscricao;
  status: StatusInscricao;
  lote_numero: number | null;
  valor: number | null;
  observacao: string | null;
  forma_pagamento: 'avista' | 'carne';
  parcelas_solicitadas: number | null;
  dados: Dados;
}

export type ModoConvite = 'carne' | 'checkout';

export interface Convite {
  token: string;
  criado_em: string;
  tipo: TipoInscricao;
  /** carne: grava sem pagamento; checkout: paga online (InfinitePay) depois da ficha. */
  modo: ModoConvite;
  observacao: string | null;
  cancelado: boolean;
  usado_em: string | null;
  inscricao_id: string | null;
}

export interface Parcela {
  id: string;
  inscricao_id: string;
  numero: number;
  total: number;
  valor: number;
  vencimento: string;
  movimento_id: string | null;
}

export interface Lote {
  tipo: TipoInscricao;
  numero: number;
  valor: number;
  vagas: number;
  aberto: boolean;
}

export type Caixa = 'inscricao' | 'doacao';
export type FormaPagamento = 'pix' | 'dinheiro' | 'cartao' | 'cupom' | 'outro';

export interface Movimento {
  id: string;
  criado_em: string;
  data: string;
  tipo: 'entrada' | 'saida';
  caixa: Caixa;
  valor: number;
  descricao: string;
  forma: FormaPagamento | null;
  inscricao_id: string | null;
  cupom_id: string | null;
}

export type NovoMovimento = Omit<Movimento, 'id' | 'criado_em' | 'cupom_id'>;

export interface Cupom {
  id: string;
  criado_em: string;
  codigo: string;
  valor: number;
  status: 'disponivel' | 'usado' | 'cancelado';
  observacao: string | null;
  inscricao_id: string | null;
  usado_em: string | null;
}

/** Campos que o admin pode alterar numa inscrição. */
export type AlteracaoInscricao = Partial<Omit<Inscricao, 'id' | 'criada_em'>>;

@Injectable({ providedIn: 'root' })
export class Supabase {
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private clienteCriado?: Promise<SupabaseClient>;

  readonly usuario = signal<User | null>(null);

  /** O cliente só existe no navegador (as páginas públicas são pré-renderizadas). */
  private cliente(): Promise<SupabaseClient> {
    if (!this.navegador) throw new Error('Supabase só está disponível no navegador.');
    if (!this.clienteCriado) {
      // Import dinâmico: a biblioteca só é baixada por quem envia a ficha ou usa o admin.
      this.clienteCriado = import('@supabase/supabase-js').then(({ createClient }) => {
        const c = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
        c.auth.onAuthStateChange((_, sessao) => this.usuario.set(sessao?.user ?? null));
        return c;
      });
    }
    return this.clienteCriado;
  }

  async usuarioAtual(): Promise<User | null> {
    if (!this.navegador) return null;
    const { data } = await (await this.cliente()).auth.getSession();
    this.usuario.set(data.session?.user ?? null);
    return data.session?.user ?? null;
  }

  async entrar(email: string, senha: string): Promise<string | null> {
    const { error } = await (await this.cliente()).auth.signInWithPassword({ email, password: senha });
    return error ? 'Usuário ou senha inválidos.' : null;
  }

  async sair(): Promise<void> {
    await (await this.cliente()).auth.signOut();
  }

  /** Ficha pública. Tipo, status, lote e valor são definidos pelo banco (ver supabase/fase1.sql). */
  /** `dados` pode ter booleanos (checkboxes de declaração e consentimento). */
  async enviarInscricao(
    dados: Record<string, Record<string, string | boolean>>,
    convite: string | null = null,
  ): Promise<string> {
    const p = dados['pessoais'];
    // O visitante não pode ler a linha de volta (RLS), então o id é gerado aqui.
    const id = crypto.randomUUID();
    const { error } = await (await this.cliente())
      .from('inscricoes')
      // A ficha de líder não pede e-mail; a coluna é obrigatória.
      .insert({ id, nome: p['nome'], telefone: p['telefone'], email: p['email'] ?? '', convite, dados });
    if (error) throw error;
    return id;
  }

  async listarInscricoes(): Promise<Inscricao[]> {
    const { data, error } = await (await this.cliente())
      .from('inscricoes')
      .select('*')
      .order('criada_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  async atualizarInscricao(id: string, alteracao: AlteracaoInscricao): Promise<Inscricao> {
    const { data, error } = await (await this.cliente())
      .from('inscricoes')
      .update(alteracao)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listarLotes(): Promise<Lote[]> {
    const { data, error } = await (await this.cliente()).from('lotes').select('*').order('tipo', { ascending: false }).order('numero');
    if (error) throw error;
    return data;
  }

  async salvarLote(lote: Lote): Promise<void> {
    const { error } = await (await this.cliente()).from('lotes').upsert(lote, { onConflict: 'tipo,numero' });
    if (error) throw error;
  }

  async listarMovimentos(): Promise<Movimento[]> {
    const { data, error } = await (await this.cliente())
      .from('movimentos')
      .select('*')
      .order('data', { ascending: false })
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  async criarMovimento(movimento: NovoMovimento): Promise<void> {
    const { error } = await (await this.cliente()).from('movimentos').insert(movimento);
    if (error) throw error;
  }

  async excluirMovimento(id: string): Promise<void> {
    const { error } = await (await this.cliente()).from('movimentos').delete().eq('id', id);
    if (error) throw error;
  }

  async listarCupons(): Promise<Cupom[]> {
    const { data, error } = await (await this.cliente())
      .from('cupons')
      .select('*')
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  /** Lança `SALDO_DOACOES_INSUFICIENTE` se o valor passar do saldo de doações livre. */
  async gerarCupom(valor: number, observacao: string): Promise<Cupom> {
    const { data, error } = await (await this.cliente()).rpc('gerar_cupom', {
      p_valor: valor,
      p_observacao: observacao,
    });
    if (error) throw error;
    return data;
  }

  async aplicarCupom(cupomId: string, inscricaoId: string): Promise<void> {
    const { error } = await (await this.cliente()).rpc('aplicar_cupom', {
      p_cupom: cupomId,
      p_inscricao: inscricaoId,
    });
    if (error) throw error;
  }

  /** Tipo e modo do link de inscrição, ou `null` se já foi usado, cancelado ou não existe. */
  async lerConvite(token: string): Promise<{ tipo: TipoInscricao; modo: ModoConvite } | null> {
    const { data, error } = await (await this.cliente()).rpc('ler_convite', { p_token: token });
    if (error) throw error;
    return data;
  }

  async listarConvites(): Promise<Convite[]> {
    const { data, error } = await (await this.cliente())
      .from('convites')
      .select('*')
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  async criarConvite(tipo: TipoInscricao, modo: ModoConvite, observacao: string): Promise<Convite> {
    const { data, error } = await (await this.cliente())
      .from('convites')
      .insert({ tipo, modo, observacao: observacao.trim() || null })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async cancelarConvite(token: string): Promise<void> {
    const { error } = await (await this.cliente())
      .from('convites')
      .update({ cancelado: true })
      .eq('token', token)
      .is('usado_em', null);
    if (error) throw error;
  }

  async listarParcelas(): Promise<Parcela[]> {
    const { data, error } = await (await this.cliente())
      .from('parcelas')
      .select('*')
      .order('vencimento')
      .order('numero');
    if (error) throw error;
    return data;
  }

  /** Recria as parcelas em aberto da inscrição (falha se alguma já foi paga). */
  async gerarCarne(inscricaoId: string, total: number, primeiroVencimento: string): Promise<void> {
    const { error } = await (await this.cliente()).rpc('gerar_carne', {
      p_inscricao: inscricaoId,
      p_total: total,
      p_primeiro_vencimento: primeiroVencimento,
    });
    if (error) throw error;
  }

  async pagarParcela(parcelaId: string, forma: FormaPagamento, data: string): Promise<void> {
    const { error } = await (await this.cliente()).rpc('pagar_parcela', {
      p_parcela: parcelaId,
      p_forma: forma,
      p_data: data,
    });
    if (error) throw error;
  }

  async cancelarCupom(id: string): Promise<void> {
    const { error } = await (await this.cliente())
      .from('cupons')
      .update({ status: 'cancelado' })
      .eq('id', id)
      .eq('status', 'disponivel');
    if (error) throw error;
  }
}
