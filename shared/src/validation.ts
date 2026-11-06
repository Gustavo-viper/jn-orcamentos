/**
 * Esquemas de validação (zod) usados pelo servidor para validar TODA escrita
 * e pelo cliente para validar formulários antes de salvar.
 */
import { z } from 'zod';
import { PRODUCT_CATEGORIES } from './types.js';

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Identificador inválido');
const str = (max = 500) => z.string().trim().max(max);
const optStr = (max = 500) => str(max).default('');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');
const money = z.number().int('Valor deve estar em centavos').min(0).max(100_000_000_00);
const measure = z.number().min(0, 'Medida não pode ser negativa').max(100_000);
const pct = z.number().min(0).max(1000);

export function onlyDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

export function isValidCPF(value: string): boolean {
  const c = onlyDigits(value);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(c[i]) * (10 - i);
  let d = (s * 10) % 11;
  if (d === 10) d = 0;
  if (d !== Number(c[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += Number(c[i]) * (11 - i);
  d = (s * 10) % 11;
  if (d === 10) d = 0;
  return d === Number(c[10]);
}

export function isValidCNPJ(value: string): boolean {
  const c = onlyDigits(value);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(c[i]) * w[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

export function isValidDocument(value: string): boolean {
  const d = onlyDigits(value);
  if (!d) return true; // documento é opcional
  return d.length === 11 ? isValidCPF(d) : d.length === 14 ? isValidCNPJ(d) : false;
}

export const clientSchema = z.object({
  name: str(200).min(2, 'Informe o nome do cliente'),
  document: optStr(20).refine(isValidDocument, 'CPF/CNPJ inválido'),
  phone: optStr(30),
  whatsapp: optStr(30),
  email: optStr(200).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'E-mail inválido'),
  cep: optStr(10),
  address: optStr(300),
  number: optStr(20),
  district: optStr(120),
  city: optStr(120),
  state: optStr(2),
  complement: optStr(200),
  notes: optStr(5000),
  status: z.enum(['active', 'inactive', 'lead']).default('active'),
});

export const clientNoteSchema = z.object({
  clientId: idSchema,
  kind: z.enum(['note', 'call', 'whatsapp', 'visit', 'email']),
  text: str(5000).min(1, 'Escreva a anotação'),
});

export const productSchema = z.object({
  code: optStr(50),
  name: str(200).min(2, 'Informe o nome do produto'),
  category: z.enum(PRODUCT_CATEGORIES),
  unit: str(20).min(1, 'Informe a unidade'),
  unitCost: money,
  description: optStr(2000),
  dimensions: optStr(100),
  plateArea: z.number().positive().max(100).nullable().default(null),
  minStock: z.number().min(0).max(10_000_000).default(0),
  supplier: optStr(200),
  indivisible: z.boolean().default(true),
  active: z.boolean().default(true),
});

export const serviceSchema = z.object({
  name: str(200).min(2, 'Informe o nome do serviço'),
  description: optStr(2000),
  measurementType: z.enum(['m2', 'ml', 'unit']),
  pricingMode: z.enum(['cost_plus', 'fixed']).default('cost_plus'),
  laborPrice: money,
  chargeUnit: str(20).min(1),
  linearBasis: z.enum(['perimeter', 'width', 'length']).default('perimeter'),
  active: z.boolean().default(true),
  materials: z
    .array(z.object({ productId: idSchema, consumption: z.number().min(0).max(100_000) }))
    .max(50)
    .default([])
    .refine((arr) => new Set(arr.map((m) => m.productId)).size === arr.length, 'Material repetido no serviço'),
});

export const deductionSchema = z.object({
  id: idSchema,
  label: optStr(100),
  width: measure,
  length: measure,
  quantity: z.number().int().min(1).max(1000).default(1),
});

export const environmentSchema = z.object({
  id: idSchema,
  name: str(120).min(1, 'Informe o nome do ambiente'),
  serviceId: idSchema,
  width: measure,
  length: measure,
  height: measure.default(0),
  surface: z.enum(['floor', 'walls']).default('floor'),
  wastePct: z.number().min(0).max(100),
  laborPriceOverride: money.nullable().default(null),
  linearOverride: measure.nullable().default(null),
  quantity: z.number().min(0).max(100_000).nullable().default(null),
  deductions: z.array(deductionSchema).max(100).default([]),
});

export const installmentSchema = z.object({ label: str(60).min(1), pct: z.number().min(0).max(100) });

export const quoteSchema = z.object({
  clientId: idSchema,
  title: optStr(200),
  status: z.enum(['draft', 'pending']).default('draft'),
  issueDate: dateStr,
  validUntil: dateStr,
  marginPct: pct,
  marginOnLabor: z.boolean().default(true),
  discountType: z.enum(['none', 'pct', 'value']).default('none'),
  discountValue: z.number().min(0).max(100_000_000_00).default(0),
  installments: z.array(installmentSchema).min(1).max(24),
  paymentTerms: optStr(2000),
  notes: optStr(5000),
  environments: z.array(environmentSchema).max(200),
});

export const jobSchema = z.object({
  address: optStr(500),
  servicesSummary: optStr(2000),
  team: optStr(500),
  startDate: dateStr.nullable().default(null),
  expectedEnd: dateStr.nullable().default(null),
  notes: optStr(5000),
});

export const financeEntrySchema = z.object({
  kind: z.enum(['in', 'out']),
  category: str(50).min(1, 'Selecione a categoria'),
  description: str(300).min(2, 'Informe a descrição'),
  amount: money.refine((v) => v > 0, 'Informe um valor maior que zero'),
  dueDate: dateStr,
  status: z.enum(['pending', 'cancelled']).optional(),
  clientId: idSchema.nullable().default(null),
  quoteId: idSchema.nullable().default(null),
  jobId: idSchema.nullable().default(null),
  method: optStr(30),
  notes: optStr(2000),
});

export const companySettingsSchema = z.object({
  name: str(200).min(2),
  logo: z.string().max(400_000, 'Logotipo muito grande (máx. ~300 KB)').nullable().default(null),
  document: optStr(20).refine(isValidDocument, 'CPF/CNPJ inválido'),
  phone: optStr(30),
  whatsapp: optStr(30),
  email: optStr(200),
  address: optStr(300),
  city: optStr(120),
  state: optStr(2),
  cep: optStr(10),
});

export const quoteSettingsSchema = z.object({
  validityDays: z.number().int().min(1).max(365),
  marginPct: pct,
  marginOnLabor: z.boolean(),
  wastePct: z.number().min(0).max(100),
  installments: z
    .array(installmentSchema)
    .min(1)
    .max(24)
    .refine((a) => Math.abs(a.reduce((s, i) => s + i.pct, 0) - 100) < 0.001, 'As parcelas devem somar 100%'),
  paymentTerms: optStr(2000),
  defaultNotes: optStr(5000),
});

export const stockMoveSchema = z.object({
  id: idSchema,
  productId: idSchema,
  type: z.enum(['in', 'out', 'adjust']),
  /** in/out: quantidade positiva; adjust: novo saldo contado */
  quantity: z.number().min(0).max(10_000_000),
  unitCost: money.nullable().default(null),
  reason: optStr(300),
  jobId: idSchema.nullable().default(null),
  allowNegative: z.boolean().default(false),
});

export const passwordSchema = z
  .string()
  .min(8, 'A senha deve ter pelo menos 8 caracteres')
  .max(200)
  .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), 'A senha deve conter letras e números');

/** Primeira mensagem de erro legível de um ZodError. */
export function firstZodError(err: z.ZodError): string {
  const i = err.issues[0];
  if (!i) return 'Dados inválidos';
  const path = i.path.join('.');
  return path ? `${i.message} (${path})` : i.message;
}
