/** Operações de negócio críticas: estoque, obras e financeiro (sempre em transação). */
import { and, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  JOB_TRANSITIONS,
  firstZodError,
  formatBRL,
  formatJobNumber,
  formatQuoteNumber,
  idSchema,
  isDrywallEnvironment,
  DRYWALL_PLATE_AREA,
  PLATE_CATEGORY,
  roundTo,
  stockMoveSchema,
  type JobEventType,
  type JobMaterial,
  type JobStatus,
  type QuoteTotals,
} from '@jn/shared';
import * as s from '../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import type { Tx } from '../db/client.js';
import { logActivity, logChange } from './audit.js';
import { bump, nextNumber, requirePerm, touch, type Ctx } from './context.js';
import { rawOne } from './records.js';

function parse<T extends z.ZodTypeAny>(schema: T, v: unknown): z.infer<T> {
  const r = schema.safeParse(v);
  if (!r.success) throw badRequest(firstZodError(r.error));
  return r.data;
}

// ======================= ESTOQUE =======================

export async function moveStock(ctx: Ctx, payload: unknown, viaJob = false) {
  const p = parse(stockMoveSchema, payload);
  if (!viaJob) requirePerm(ctx, 'products', 'edit');
  const { tx } = ctx;
  const dup = await rawOne(tx, 'stockMovements', p.id);
  if (dup) {
    touch(ctx, 'stockMovements', p.id);
    return; // idempotente
  }
  const prod = await rawOne<typeof s.products.$inferSelect>(tx, 'products', p.productId);
  if (!prod || prod.deletedAt) throw notFound('Produto não encontrado.');
  if (p.type !== 'adjust' && !(p.quantity > 0)) throw badRequest('Informe uma quantidade maior que zero.');
  const delta = roundTo(p.type === 'in' ? p.quantity : p.type === 'out' ? -p.quantity : p.quantity - prod.quantity, 3);
  const balance = roundTo(prod.quantity + delta, 3);
  if (balance < 0) {
    if (!p.allowNegative) throw conflict(`Estoque insuficiente de "${prod.name}": saldo ${prod.quantity} ${prod.unit}, saída de ${-delta}.`);
    if (ctx.user.role !== 'admin') throw forbidden('Somente o administrador pode autorizar estoque negativo.');
  }
  if (p.type === 'adjust' && !p.reason) throw badRequest('Informe o motivo do ajuste de estoque.');
  await tx.insert(s.stockMovements).values({
    id: p.id,
    productId: prod.id,
    type: p.type,
    delta,
    balanceAfter: balance,
    unitCost: p.unitCost ?? prod.unitCost,
    reason: p.reason,
    jobId: p.jobId,
    createdBy: ctx.user.id,
    createdByName: ctx.user.name,
  });
  await tx.update(s.products).set({ quantity: balance, ...bump(s.products) }).where(eq(s.products.id, prod.id));
  const typeLabel = { in: 'Entrada', out: 'Saída', adjust: 'Ajuste' }[p.type];
  await logActivity(tx, ctx.actor, `stock.${p.type}`, 'products', prod.id, `${typeLabel} de estoque: ${prod.name} (${delta > 0 ? '+' : ''}${delta} ${prod.unit}) — saldo ${balance}${balance < 0 ? ' (negativo autorizado)' : ''}`);
  touch(ctx, 'stockMovements', p.id);
  touch(ctx, 'products', prod.id);
}

// ======================= OBRAS =======================

async function addJobEvent(ctx: Ctx, jobId: string, eventId: string | undefined, type: JobEventType, note: string, statusTo: JobStatus | null) {
  const id = eventId && /^[A-Za-z0-9_-]{8,64}$/.test(eventId) ? eventId : newId();
  if (await rawOne(ctx.tx, 'jobEvents', id)) return;
  await ctx.tx.insert(s.jobEvents).values({ id, jobId, type, note, statusTo, createdBy: ctx.user.id, createdByName: ctx.user.name });
  touch(ctx, 'jobEvents', id);
}

async function getJob(ctx: Ctx, id: string) {
  const job = await rawOne<typeof s.jobs.$inferSelect>(ctx.tx, 'jobs', id);
  if (!job || job.deletedAt) throw notFound('Ordem de serviço não encontrada.');
  return job;
}

const fromQuoteSchema = z.object({
  jobId: idSchema,
  quoteId: idSchema,
  eventId: idSchema.optional(),
  team: z.string().max(500).default(''),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  expectedEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  notes: z.string().max(5000).default(''),
});

/**
 * Controle de material: só entram as placas de acartonado (drywall).
 * Soma as placas dos ambientes de acartonado e, quando o serviço não tem
 * produto-placa vinculado, usa o produto de placa cadastrado (1,80 x 1,20) para as placas calculadas.
 */
async function drywallMaterials(tx: Tx, calc: QuoteTotals): Promise<JobMaterial[]> {
  const envs = calc.environments.filter((e) => isDrywallEnvironment(e));
  const byId = new Map<string, JobMaterial>();
  const add = (productId: string, name: string, unit: string, qty: number) => {
    const cur = byId.get(productId);
    if (cur) cur.plannedQty = roundTo(cur.plannedQty + qty, 3);
    else byId.set(productId, { productId, name, unit, plannedQty: roundTo(qty, 3), consumedQty: 0 });
  };
  let uncoveredPlates = 0;
  for (const e of envs) {
    for (const m of e.materials ?? []) if (m.isPlate) add(m.productId, m.name, m.unit, m.qty);
    if ((e.plates ?? 0) > 0 && !(e.materials ?? []).some((m) => m.isPlate)) uncoveredPlates += e.plates;
  }
  if (uncoveredPlates > 0) {
    const plates = await tx
      .select({ id: s.products.id, name: s.products.name, unit: s.products.unit, plateArea: s.products.plateArea })
      .from(s.products)
      .where(and(eq(s.products.category, PLATE_CATEGORY), eq(s.products.active, true), isNull(s.products.deletedAt)));
    plates.sort((a, b) => Math.abs((a.plateArea ?? 0) - DRYWALL_PLATE_AREA) - Math.abs((b.plateArea ?? 0) - DRYWALL_PLATE_AREA));
    const plate = plates[0];
    if (plate) add(plate.id, plate.name, plate.unit, uncoveredPlates);
  }
  return [...byId.values()];
}

export async function jobFromQuote(ctx: Ctx, payload: unknown) {
  requirePerm(ctx, 'jobs', 'create');
  const p = parse(fromQuoteSchema, payload);
  const { tx } = ctx;
  if (await rawOne(tx, 'jobs', p.jobId)) {
    touch(ctx, 'jobs', p.jobId);
    return;
  }
  const q = await rawOne<typeof s.quotes.$inferSelect>(tx, 'quotes', p.quoteId);
  if (!q || q.deletedAt) throw notFound('Orçamento não encontrado.');
  if (q.status !== 'approved') throw conflict('A ordem de serviço só pode ser gerada a partir de um orçamento aprovado.');
  const [existing] = await tx
    .select({ id: s.jobs.id, number: s.jobs.number })
    .from(s.jobs)
    .where(and(eq(s.jobs.quoteId, q.id), isNull(s.jobs.deletedAt), ne(s.jobs.status, 'cancelled')));
  if (existing) throw conflict(`Este orçamento já possui a ordem de serviço ${formatJobNumber(existing.number)}.`);
  const [client] = await tx.select().from(s.clients).where(eq(s.clients.id, q.clientId));
  const calc = q.calc as QuoteTotals;
  const address = client
    ? [client.address && `${client.address}${client.number ? `, ${client.number}` : ''}`, client.complement, client.district, client.city && `${client.city}${client.state ? `/${client.state}` : ''}`]
        .filter(Boolean)
        .join(' — ')
    : '';
  const summary = calc.environments
    .map((e) => `${e.name}: ${e.serviceName} — ${e.measure} ${e.chargeUnit}`)
    .join('\n');
  const materials = await drywallMaterials(tx, calc);
  const number = await nextNumber(tx, 'job');
  const status: JobStatus = p.startDate ? 'scheduled' : 'waiting';
  await tx.insert(s.jobs).values({
    id: p.jobId,
    number,
    quoteId: q.id,
    clientId: q.clientId,
    address,
    servicesSummary: summary,
    team: p.team,
    startDate: p.startDate,
    expectedEnd: p.expectedEnd,
    status,
    contractedValue: q.total,
    notes: p.notes,
    materials,
  });
  // vincula as contas a receber existentes do orçamento à obra
  const linked = await tx
    .update(s.financeEntries)
    .set({ jobId: p.jobId, ...bump(s.financeEntries) })
    .where(and(eq(s.financeEntries.quoteId, q.id), isNull(s.financeEntries.jobId)))
    .returning({ id: s.financeEntries.id });
  linked.forEach((l) => touch(ctx, 'financeEntries', l.id));
  await addJobEvent(ctx, p.jobId, p.eventId, 'created', `Gerada a partir do orçamento ${formatQuoteNumber(q.number)}`, status);
  if (status === 'scheduled') await addJobEvent(ctx, p.jobId, undefined, 'scheduled', `Início agendado para ${p.startDate}`, 'scheduled');
  await logActivity(tx, ctx.actor, 'job.create', 'jobs', p.jobId, `Ordem de serviço ${formatJobNumber(number)} criada — ${client?.name ?? ''} — ${formatBRL(q.total)}`);
  touch(ctx, 'jobs', p.jobId);
}

const setStatusSchema = z.object({
  jobId: idSchema,
  eventId: idSchema.optional(),
  status: z.enum(['waiting', 'scheduled', 'in_progress', 'paused', 'cancelled']),
  note: z.string().max(2000).default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function setJobStatus(ctx: Ctx, payload: unknown) {
  requirePerm(ctx, 'jobs', 'edit');
  const p = parse(setStatusSchema, payload);
  const job = await getJob(ctx, p.jobId);
  if (job.status === p.status) return touch(ctx, 'jobs', job.id);
  if (!JOB_TRANSITIONS[job.status].includes(p.status)) throw conflict('Mudança de situação não permitida para esta obra.');
  const patch: Partial<typeof s.jobs.$inferInsert> = { status: p.status };
  let type: JobEventType = 'updated';
  if (p.status === 'scheduled') {
    type = 'scheduled';
    if (p.date) patch.startDate = p.date;
  } else if (p.status === 'in_progress') {
    type = job.status === 'paused' ? 'resumed' : 'started';
    if (!job.startDate || type === 'started') patch.startDate = p.date ?? job.startDate ?? new Date().toISOString().slice(0, 10);
  } else if (p.status === 'paused') type = 'paused';
  else if (p.status === 'cancelled') type = 'cancelled';
  await ctx.tx.update(s.jobs).set({ ...patch, ...bump(s.jobs) }).where(eq(s.jobs.id, job.id));
  await addJobEvent(ctx, job.id, p.eventId, type, p.note, p.status);
  await logActivity(ctx.tx, ctx.actor, `job.${p.status}`, 'jobs', job.id, `Obra ${formatJobNumber(job.number)}: ${{ waiting: 'aguardando', scheduled: 'agendada', in_progress: type === 'resumed' ? 'retomada' : 'iniciada', paused: 'pausada', cancelled: 'cancelada' }[p.status]}`);
  touch(ctx, 'jobs', job.id);
}

export async function addJobNote(ctx: Ctx, payload: unknown) {
  requirePerm(ctx, 'jobs', 'edit');
  const p = parse(z.object({ jobId: idSchema, eventId: idSchema.optional(), note: z.string().trim().min(1, 'Escreva a atualização').max(5000) }), payload);
  const job = await getJob(ctx, p.jobId);
  await addJobEvent(ctx, job.id, p.eventId, 'note', p.note, null);
  await ctx.tx.update(s.jobs).set(bump(s.jobs)).where(eq(s.jobs.id, job.id));
  touch(ctx, 'jobs', job.id);
}

const consumeLine = z.object({ productId: idSchema, movementId: idSchema, quantity: z.number().positive().max(1_000_000), allowNegative: z.boolean().default(false) });

async function applyConsumption(ctx: Ctx, job: typeof s.jobs.$inferSelect, lines: z.infer<typeof consumeLine>[]) {
  const materials = [...((job.materials as JobMaterial[]) ?? [])].map((m) => ({ ...m }));
  const notes: string[] = [];
  for (const l of lines) {
    const already = await rawOne(ctx.tx, 'stockMovements', l.movementId);
    if (already) continue; // idempotente
    await moveStock(ctx, { id: l.movementId, productId: l.productId, type: 'out', quantity: l.quantity, reason: `Consumo na obra ${formatJobNumber(job.number)}`, jobId: job.id, allowNegative: l.allowNegative }, true);
    const prod = await rawOne<typeof s.products.$inferSelect>(ctx.tx, 'products', l.productId);
    let m = materials.find((x) => x.productId === l.productId);
    if (!m) {
      m = { productId: l.productId, name: prod?.name ?? '', unit: prod?.unit ?? '', plannedQty: 0, consumedQty: 0 };
      materials.push(m);
    }
    m.consumedQty = roundTo(m.consumedQty + l.quantity, 3);
    notes.push(`${prod?.name}: ${l.quantity} ${prod?.unit}`);
  }
  if (notes.length) {
    await ctx.tx.update(s.jobs).set({ materials, ...bump(s.jobs) }).where(eq(s.jobs.id, job.id));
    job.materials = materials;
  }
  return notes;
}

export async function consumeOnJob(ctx: Ctx, payload: unknown) {
  requirePerm(ctx, 'jobs', 'edit');
  const p = parse(z.object({ jobId: idSchema, eventId: idSchema.optional(), lines: z.array(consumeLine).min(1).max(100) }), payload);
  const job = await getJob(ctx, p.jobId);
  if (job.status === 'completed' || job.status === 'cancelled') throw conflict('Obra encerrada: não é possível registrar consumo.');
  const notes = await applyConsumption(ctx, job, p.lines);
  if (notes.length) await addJobEvent(ctx, job.id, p.eventId, 'material', `Consumo registrado: ${notes.join('; ')}`, null);
  touch(ctx, 'jobs', job.id);
}

export async function completeJob(ctx: Ctx, payload: unknown) {
  requirePerm(ctx, 'jobs', 'edit');
  const p = parse(
    z.object({
      jobId: idSchema,
      eventId: idSchema.optional(),
      completedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      note: z.string().max(5000).default(''),
      lines: z.array(consumeLine).max(100).default([]),
    }),
    payload,
  );
  const job = await getJob(ctx, p.jobId);
  if (job.status === 'completed') return touch(ctx, 'jobs', job.id);
  if (job.status !== 'in_progress' && job.status !== 'paused') throw conflict('Somente obras em andamento ou pausadas podem ser concluídas.');
  const notes = await applyConsumption(ctx, job, p.lines);
  const completedAt = p.completedAt ? new Date(`${p.completedAt}T12:00:00`) : new Date();
  await ctx.tx.update(s.jobs).set({ status: 'completed', completedAt, ...bump(s.jobs) }).where(eq(s.jobs.id, job.id));
  await addJobEvent(ctx, job.id, p.eventId, 'completed', [p.note, notes.length ? `Consumo final: ${notes.join('; ')}` : ''].filter(Boolean).join('\n'), 'completed');
  await logActivity(ctx.tx, ctx.actor, 'job.completed', 'jobs', job.id, `Obra ${formatJobNumber(job.number)} concluída`);
  touch(ctx, 'jobs', job.id);
}

// ======================= FINANCEIRO =======================

const paySchema = z.object({
  entryId: idSchema,
  paymentId: idSchema,
  amount: z.number().int().positive().optional(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().max(30).default(''),
  notes: z.string().max(2000).default(''),
});

/** Registra pagamento (total ou parcial). Somente confirma o que foi informado — nunca automaticamente. */
export async function payEntry(ctx: Ctx, payload: unknown) {
  requirePerm(ctx, 'finance', 'edit');
  const p = parse(paySchema, payload);
  const { tx } = ctx;
  if (await rawOne(tx, 'payments', p.paymentId)) {
    touch(ctx, 'financeEntries', p.entryId);
    return;
  }
  const e = await rawOne<typeof s.financeEntries.$inferSelect>(tx, 'financeEntries', p.entryId);
  if (!e || e.deletedAt) throw notFound('Lançamento não encontrado.');
  if (e.status === 'cancelled') throw conflict('Lançamento cancelado não pode receber pagamento.');
  if (e.status === 'paid') throw conflict('Este lançamento já está quitado.');
  const remaining = e.amount - e.paidAmount;
  const amount = p.amount ?? remaining;
  if (amount > remaining) throw badRequest(`O valor informado (${formatBRL(amount)}) é maior que o saldo em aberto (${formatBRL(remaining)}).`);
  const paidAt = new Date(`${p.paidAt}T12:00:00`);
  await tx.insert(s.payments).values({ id: p.paymentId, entryId: e.id, amount, paidAt, method: p.method, notes: p.notes, createdBy: ctx.user.id });
  const paidAmount = e.paidAmount + amount;
  const done = paidAmount >= e.amount;
  await tx
    .update(s.financeEntries)
    .set({ paidAmount, status: done ? 'paid' : 'pending', paidAt: done ? paidAt : e.paidAt, method: p.method || e.method, ...bump(s.financeEntries) })
    .where(eq(s.financeEntries.id, e.id));
  await logChange(tx, ctx.actor, 'financeEntries', e.id, 'payment', { paidAmount: e.paidAmount, status: e.status }, { paidAmount, status: done ? 'paid' : 'pending' });
  await logActivity(tx, ctx.actor, 'finance.payment', 'financeEntries', e.id, `${e.kind === 'in' ? 'Recebimento' : 'Pagamento'} registrado: ${formatBRL(amount)} — ${e.description}${done ? '' : ' (parcial)'}`);
  touch(ctx, 'payments', p.paymentId);
  touch(ctx, 'financeEntries', e.id);
}
