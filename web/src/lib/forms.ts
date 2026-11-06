import type { z } from 'zod';

/** Converte erros do zod em mensagens por campo. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? '_');
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/** Retorna somente os campos que mudaram (ou todos, se for criação). */
export function diffPatch<T extends Record<string, unknown>>(original: Partial<T> | null | undefined, next: T): Partial<T> {
  if (!original) return next;
  const patch: Partial<T> = {};
  for (const k of Object.keys(next) as (keyof T)[]) {
    if (JSON.stringify(original[k]) !== JSON.stringify(next[k])) patch[k] = next[k];
  }
  return patch;
}
