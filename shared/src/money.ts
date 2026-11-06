/**
 * Utilitários monetários e numéricos.
 * Todos os valores monetários do sistema são armazenados em CENTAVOS (inteiros)
 * para evitar erros de ponto flutuante.
 */

const EPS = 1e-9;

/** Arredonda um número para `digits` casas decimais de forma estável. */
export function roundTo(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** digits;
  return Math.round((value + Math.sign(value) * EPS) * f) / f;
}

/** Arredonda para cima tolerando ruído de ponto flutuante (ex.: 3.0000000001 => 3). */
export function ceilSafe(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(roundTo(value, 6) - EPS);
}

/** Arredonda para o centavo inteiro mais próximo. */
export function cents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value + Math.sign(value) * EPS);
}

/** Converte reais (número decimal) em centavos. */
export function toCents(reais: number): number {
  return cents(reais * 100);
}

/** Converte centavos em reais. */
export function fromCents(c: number): number {
  return c / 100;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata centavos como moeda brasileira (R$ 1.234,56). */
export function formatBRL(c: number | null | undefined): string {
  return brl.format((c ?? 0) / 100);
}

export function formatNumber(n: number | null | undefined, digits = 2): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(n ?? 0);
}

/**
 * Interpreta texto digitado em formato brasileiro ("1.234,56" ou "1234.56") como número.
 * Retorna NaN se inválido.
 */
export function parseDecimal(text: string | number | null | undefined): number {
  if (typeof text === 'number') return text;
  if (text == null) return NaN;
  let s = String(text).trim().replace(/[R$\s]/g, '');
  if (s === '') return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
