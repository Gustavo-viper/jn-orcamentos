/**
 * Gravação genérica (criar/alterar/excluir) das entidades editáveis.
 *
 * Estratégia de conflito: o cliente envia somente os campos alterados (patch) e a
 * versão em que se baseou. Se o servidor tiver uma versão mais nova, os campos do
 * patch são aplicados sobre a versão atual (mesclagem por campo — "último a gravar
 * vence por campo") e o conflito é registrado em sync_conflicts para auditoria.
 * Campos que o usuário não alterou nunca são sobrescritos.
 */
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  clientNoteSchema,
  clientSchema,
  companySettingsSchema,
  financeEntrySchema,
  firstZodError,
  formatBRL,
  idSchema,
  jobSchema,
  productSchema,
  quoteSettingsSchema,
  serviceSchema,
  type Module,
  type UpsertTable,
} from '@jn/shared';
import * as s from '../db/schema.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { logActivity, logChange } from './audit.js';
import { bump, nextNumber, requirePerm, touch, type Ctx } from './context.js';
import { loadOne, rawOne, SYNC_PG } from './records.js';
import { saveQuote } from './quotes.js';

const jobCreateSchema = jobSchema.extend({
  clientId: idSchema,
  contractedValue: z.number().int().min(0).max(100_000_000_00).default(0),
  quoteId: idSchema.nullable().default(null),
});
const jobEditSchema = jobSchema.extend({ contractedValue: z.number().int().min(0).max(100_000_000_00) });

interface Def {
  module: Module;
  schema: z.ZodObject<z.ZodRawShape>;
  createSchema?: z.ZodObject<z.ZodRawShape>;
  label: string;
  describe: (r: Record<string, unknown>) => string;
  /** validações e efeitos adicionais antes da gravação */
  before?: (ctx: Ctx, id: string, values: Record<string, unknown>, existing: Record<string, unknown> | null) => Promise<void>;
  after?: (ctx: Ctx, id: string, values: Record<string, unknown>) => Promise<void>;
  /** regra para exclusão — lança erro se não puder excluir */
  canDelete?: (ctx: Ctx, id: string, existing: Record<string, unknown>) => Promise<void>;
  /** gravar atividade em alterações (padrão: sim) */
  activity?: boolean;
}

const DEFS: Partial<Record<UpsertTable, Def>> = {
  clients: {
    module: 'clients',
    schema: clientSchema,
    label: 'Cliente',
    describe: (r) => String(r.name),
    canDelete: async (ctx, id) => {
      const [q] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(s.quotes).where(and(eq(s.quotes.clientId, id), isNull(s.quotes.deletedAt)));
      const [j] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(s.jobs).where(and(eq(s.jobs.clientId, id), isNull(s.jobs.deletedAt)));
      const [f] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(s.financeEntries).where(and(eq(s.financeEntries.clientId, id), isNull(s.financeEntries.deletedAt)));
      if (q.n || j.n || f.n) throw conflict('Este cliente possui orçamentos, obras ou lançamentos vinculados. Altere a situação para "Inativo" em vez de excluir.');
    },
  },
  clientNotes: {
    module: 'clients',
    schema: clientNoteSchema,
    label: 'Atendimento',
    describe: (r) => String(r.text).slice(0, 60),
    activity: false,
    before: async (ctx, id, v, existing) => {
      const c = await rawOne(ctx.tx, 'clients', String(v.clientId));
      if (!c) throw badRequest('Cliente não encontrado.');
      if (!existing) {
        v.createdBy = ctx.user.id;
        v.createdByName = ctx.user.name;
      }
    },
  },
  products: {
    module: 'products',
    schema: productSchema,
    label: 'Produto',
    describe: (r) => String(r.name),
    before: async (_ctx, _id, v) => {
      if (v.category === 'placas' && !(Number(v.plateArea) > 0)) throw badRequest('Informe a área da placa (m²) para produtos da categoria Placas.');
    },
    canDelete: async (ctx, id) => {
      const used = await ctx.tx
        .select({ id: s.services.id, name: s.services.name })
        .from(s.serviceMaterials)
        .innerJoin(s.services, eq(s.services.id, s.serviceMaterials.serviceId))
        .where(and(eq(s.serviceMaterials.productId, id), isNull(s.services.deletedAt)))
        .limit(1);
      if (used.length) throw conflict(`Produto usado no serviço "${used[0].name}". Remova-o do serviço ou desative o produto.`);
    },
  },
  services: {
    module: 'services',
    schema: serviceSchema,
    label: 'Serviço',
    describe: (r) => String(r.name),
    before: async (ctx, _id, v) => {
      const mats = (v.materials as { productId: string }[]) ?? [];
      if (mats.length) {
        const found = await ctx.tx.select({ id: s.products.id }).from(s.products).where(and(inArray(s.products.id, mats.map((m) => m.productId)), isNull(s.products.deletedAt)));
        if (found.length !== new Set(mats.map((m) => m.productId)).size) throw badRequest('Um dos materiais do serviço não existe mais no cadastro de produtos.');
      }
    },
    after: async (ctx, id, v) => {
      if (!('materials' in v)) return;
      const mats = v.materials as { productId: string; consumption: number }[];
      await ctx.tx.delete(s.serviceMaterials).where(eq(s.serviceMaterials.serviceId, id));
      if (mats.length)
        await ctx.tx.insert(s.serviceMaterials).values(mats.map((m, i) => ({ id: newId(), serviceId: id, productId: m.productId, consumption: m.consumption, position: i })));
    },
    canDelete: async (ctx, id) => {
      const used = await ctx.tx
        .select({ id: s.quoteItems.id })
        .from(s.quoteItems)
        .innerJoin(s.quotes, eq(s.quotes.id, s.quoteItems.quoteId))
        .where(and(eq(s.quoteItems.serviceId, id), isNull(s.quotes.deletedAt)))
        .limit(1);
      if (used.length) throw conflict('Este serviço já foi utilizado em orçamentos. Desative-o em vez de excluir.');
    },
  },
  jobs: {
    module: 'jobs',
    schema: jobEditSchema,
    createSchema: jobCreateSchema,
    label: 'Ordem de serviço',
    describe: (r) => String(r.servicesSummary || r.address || 'OS').slice(0, 60),
    before: async (ctx, id, v, existing) => {
      if (!existing) {
        const c = await rawOne(ctx.tx, 'clients', String(v.clientId));
        if (!c) throw badRequest('Cliente não encontrado.');
        if (v.quoteId) throw badRequest('Para gerar a OS a partir de um orçamento, use "Gerar ordem de serviço" no orçamento aprovado.');
        v.number = await nextNumber(ctx.tx, 'job');
        v.status = 'waiting';
        v.materials = [];
      } else if (existing.status === 'completed' || existing.status === 'cancelled') {
        throw conflict('Obra encerrada não pode ser alterada.');
      }
    },
    after: async (ctx, id, v) => {
      const ev = { id: newId(), jobId: id, createdBy: ctx.user.id, createdByName: ctx.user.name };
      if (v.number !== undefined) {
        await ctx.tx.insert(s.jobEvents).values({ ...ev, type: 'created', note: 'Ordem de serviço avulsa criada', statusTo: 'waiting' });
      } else {
        // alteração relevante entra na linha do tempo
        const labels: Record<string, string> = { team: 'equipe', startDate: 'data de início', expectedEnd: 'previsão de conclusão', address: 'endereço', contractedValue: 'valor contratado' };
        const fields = Object.keys(v).filter((k) => k in labels);
        if (fields.length) await ctx.tx.insert(s.jobEvents).values({ ...ev, type: 'updated', note: `Alterado: ${fields.map((f) => labels[f]).join(', ')}`, statusTo: null });
      }
      touch(ctx, 'jobEvents', ev.id);
    },
    canDelete: async (_ctx, _id, existing) => {
      if (!['waiting', 'cancelled'].includes(String(existing.status))) throw conflict('Somente OS aguardando ou canceladas podem ser excluídas.');
      if (((existing.materials as { consumedQty: number }[]) ?? []).some((m) => m.consumedQty > 0)) throw conflict('Esta OS possui consumo de materiais registrado.');
    },
  },
  financeEntries: {
    module: 'finance',
    schema: financeEntrySchema,
    label: 'Lançamento',
    describe: (r) => `${r.description} — ${formatBRL(Number(r.amount))}`,
    before: async (ctx, _id, v, existing) => {
      if (existing) {
        if (existing.status === 'paid' && Number(v.amount) !== Number(existing.amount)) throw conflict('Lançamento quitado: o valor não pode ser alterado.');
        if (Number(v.amount) < Number(existing.paidAmount)) throw badRequest('O valor não pode ser menor que o total já pago.');
        if (existing.status === 'paid') delete v.status;
        if (v.status === 'cancelled' && Number(existing.paidAmount) > 0) throw conflict('Lançamento com pagamentos não pode ser cancelado.');
      }
      if (v.status === undefined && !existing) v.status = 'pending';
      for (const [k, t] of [['clientId', 'clients'], ['quoteId', 'quotes'], ['jobId', 'jobs']] as const)
        if (v[k] && !(await rawOne(ctx.tx, t, String(v[k])))) throw badRequest('Registro vinculado não encontrado.');
    },
    canDelete: async (_ctx, _id, existing) => {
      if (Number(existing.paidAmount) > 0) throw conflict('Lançamento possui pagamentos registrados e não pode ser excluído.');
    },
  },
};

async function saveSettings(ctx: Ctx, id: string, data: Record<string, unknown>) {
  requirePerm(ctx, 'settings', 'edit');
  const schema = id === 'company' ? companySettingsSchema : id === 'quote' ? quoteSettingsSchema : null;
  if (!schema) throw badRequest('Configuração desconhecida.');
  const existing = await rawOne<typeof s.settings.$inferSelect>(ctx.tx, 'settings', id);
  const merged = { ...((existing?.value as object) ?? {}), ...((data.value as object) ?? {}) };
  const r = schema.safeParse(merged);
  if (!r.success) throw badRequest(firstZodError(r.error));
  if (existing) await ctx.tx.update(s.settings).set({ value: r.data, ...bump(s.settings) }).where(eq(s.settings.id, id));
  else await ctx.tx.insert(s.settings).values({ id, value: r.data });
  await logChange(ctx.tx, ctx.actor, 'settings', id, 'update', existing?.value, r.data);
  await logActivity(ctx.tx, ctx.actor, 'settings.update', 'settings', id, `Configurações ${id === 'company' ? 'da empresa' : 'de orçamentos'} alteradas`);
  touch(ctx, 'settings', id);
}

export async function upsertRecord(ctx: Ctx, table: UpsertTable, id: string, data: Record<string, unknown>, baseVersion: number | null, opId: string) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw badRequest('Identificador inválido.');
  if (table === 'quotes') return saveQuote(ctx, id, data, baseVersion, opId);
  if (table === 'settings') return saveSettings(ctx, id, data);
  const def = DEFS[table];
  if (!def) throw badRequest('Tabela não suportada.');
  const pg = SYNC_PG[table].table;
  const existing = await rawOne<Record<string, unknown>>(ctx.tx, table, id);
  if (existing?.deletedAt) throw conflict(`${def.label} foi excluído(a) por outro usuário.`);
  requirePerm(ctx, def.module, existing ? 'edit' : 'create');

  const schema = !existing && def.createSchema ? def.createSchema : def.schema;
  const current = existing ? await loadOne(ctx.tx, table, id) : null;
  const fields = Object.keys(schema.shape);
  // mesclagem por campo: somente os campos enviados substituem os atuais
  const merged: Record<string, unknown> = {};
  for (const k of fields) merged[k] = k in data ? data[k] : current?.[k];
  const parsed = schema.safeParse(merged);
  if (!parsed.success) throw badRequest(firstZodError(parsed.error));
  const values = parsed.data as Record<string, unknown>;

  if (existing && baseVersion != null && baseVersion !== existing.version) {
    await ctx.tx.insert(s.syncConflicts).values({
      id: newId(),
      opId,
      userId: ctx.user.id,
      entity: table,
      entityId: id,
      baseVersion,
      serverVersion: Number(existing.version),
      clientData: JSON.parse(JSON.stringify(data)),
      serverData: JSON.parse(JSON.stringify(current)),
      resolution: `mesclagem por campo: aplicados ${Object.keys(data).filter((k) => fields.includes(k)).join(', ') || 'nenhum campo'}`,
    });
  }

  await def.before?.(ctx, id, values, existing);
  const cols: Record<string, unknown> = { ...values };
  if (table === 'services') delete cols.materials; // gravados em service_materials
  for (const k of Object.keys(cols)) if (cols[k] === undefined) delete cols[k];

  if (existing) await ctx.tx.update(pg).set({ ...cols, ...bump(pg) }).where(eq(pg.id, id));
  else await ctx.tx.insert(pg).values({ id, ...cols });
  await def.after?.(ctx, id, existing ? Object.fromEntries(Object.keys(data).filter((k) => fields.includes(k)).map((k) => [k, values[k]])) : values);

  const after = await loadOne(ctx.tx, table, id);
  await logChange(ctx.tx, ctx.actor, table, id, existing ? 'update' : 'create', current, after);
  if (def.activity !== false)
    await logActivity(ctx.tx, ctx.actor, `${table}.${existing ? 'update' : 'create'}`, table, id, `${def.label} ${existing ? 'alterado(a)' : 'cadastrado(a)'}: ${def.describe(after ?? values)}`);
  touch(ctx, table, id);
  if (table === 'clientNotes') touch(ctx, 'clients', String(values.clientId));
}

export async function deleteRecord(ctx: Ctx, table: UpsertTable, id: string) {
  if (table === 'settings') throw badRequest('Configurações não podem ser excluídas.');
  const pg = SYNC_PG[table].table;
  const existing = await rawOne<Record<string, unknown>>(ctx.tx, table, id);
  if (!existing) throw notFound();
  if (existing.deletedAt) return touch(ctx, table, id); // idempotente
  if (table === 'quotes') {
    requirePerm(ctx, 'quotes', 'delete');
    const [job] = await ctx.tx.select({ id: s.jobs.id }).from(s.jobs).where(and(eq(s.jobs.quoteId, id), isNull(s.jobs.deletedAt), ne(s.jobs.status, 'cancelled'))).limit(1);
    if (job) throw conflict('Este orçamento possui ordem de serviço ativa e não pode ser excluído.');
    const [fin] = await ctx.tx.select({ id: s.financeEntries.id }).from(s.financeEntries).where(and(eq(s.financeEntries.quoteId, id), isNull(s.financeEntries.deletedAt), ne(s.financeEntries.status, 'cancelled'))).limit(1);
    if (fin) throw conflict('Este orçamento possui lançamentos financeiros. Cancele-os antes de excluir.');
  } else {
    const def = DEFS[table]!;
    requirePerm(ctx, def.module, 'delete');
    await def.canDelete?.(ctx, id, existing);
  }
  const before = await loadOne(ctx.tx, table, id);
  await ctx.tx.update(pg).set({ deletedAt: new Date(), ...bump(pg) }).where(eq(pg.id, id));
  await logChange(ctx.tx, ctx.actor, table, id, 'delete', before, null);
  const label = table === 'quotes' ? 'Orçamento' : DEFS[table]!.label;
  await logActivity(ctx.tx, ctx.actor, `${table}.delete`, table, id, `${label} excluído(a): ${table === 'quotes' ? `#${existing.number ?? ''}` : DEFS[table]!.describe(existing)}`);
  touch(ctx, table, id);
}

