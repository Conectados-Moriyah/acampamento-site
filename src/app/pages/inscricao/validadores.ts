import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Converte "dd/mm/aaaa" em Date, ou null se a data não existir no calendário. */
export function lerDataBr(valor: string | null | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor ?? '');
  if (!m) return null;
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(ano, mes - 1, dia);
  const valida =
    data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
  return valida ? data : null;
}

export function calcularIdade(nascimento: Date, hoje = new Date()): number {
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const fezAniversario =
    hoje.getMonth() > nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() >= nascimento.getDate());
  if (!fezAniversario) idade--;
  return idade;
}

export const dataBr: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  if (!c.value) return null;
  const data = lerDataBr(c.value);
  if (!data) return { dataInvalida: true };
  if (data > new Date()) return { dataFutura: true };
  if (calcularIdade(data) > 110) return { dataInvalida: true };
  return null;
};

export const cpf: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  if (!c.value) return null;
  const d = soDigitos(c.value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return { cpf: true };
  const digito = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]) ? null : { cpf: true };
};

export const telefone: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  if (!c.value) return null;
  const d = soDigitos(c.value);
  // DDD válido (11–99) + fixo (8 dígitos) ou celular (9 dígitos começando com 9).
  const ok = /^[1-9][1-9]\d{8}$/.test(d) || /^[1-9][1-9]9\d{8}$/.test(d);
  return ok ? null : { telefone: true };
};

export const nomeCompleto: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  if (!c.value) return null;
  const partes = String(c.value).trim().split(/\s+/);
  const soLetras = /^[A-Za-zÀ-ÖØ-öø-ÿ'’.-]+$/;
  return partes.length >= 2 && partes.every((p) => soLetras.test(p)) ? null : { nomeCompleto: true };
};

/** Nome sem acentos, caixa e espaços extras, para comparar "José  da Silva" com "jose da silva". */
const normalizarNome = (v: string) =>
  v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * Impede que um campo do responsável repita o mesmo campo do participante (ex.: o jovem colocando
 * o próprio nome ou telefone como responsável). `caminho` é o campo do participante no formulário.
 */
export function diferenteDoParticipante(caminho: string, tipo: 'nome' | 'telefone'): ValidatorFn {
  const normalizar = tipo === 'nome' ? normalizarNome : soDigitos;
  return (c: AbstractControl): ValidationErrors | null => {
    const participante = c.root.get(caminho)?.value;
    if (!c.value || !participante) return null;
    return normalizar(c.value) === normalizar(participante)
      ? { [tipo === 'nome' ? 'mesmoNome' : 'mesmoTelefone']: true }
      : null;
  };
}

/** Máscaras aplicadas enquanto a pessoa digita. */
export const mascaras = {
  data(v: string) {
    const d = soDigitos(v).slice(0, 8);
    return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
  },
  cpf(v: string) {
    const d = soDigitos(v).slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  },
  telefone(v: string) {
    const d = soDigitos(v).slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    const meio = d.length === 11 ? 7 : 6;
    return `(${d.slice(0, 2)}) ${d.slice(2, meio)}${d.length > meio ? '-' + d.slice(meio) : ''}`;
  },
};
