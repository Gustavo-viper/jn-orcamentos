/**
 * Sincronização offline-first.
 *
 * PUSH: o cliente envia sua fila persistente de operações. Cada operação tem um
 * opId único; operações já processadas são reconhecidas (idempotência) e nunca
 * aplicadas duas vezes. Cada operação roda em sua própria transação serializada.
 *
 * PULL: o cliente informa o último `seq` recebido e recebe somente o que mudou
 * depois disso (incluindo exclusões lógicas). O servidor nunca envia "listas
 * completas" para substituir dados locais — o cliente apenas mescla registro a registro.
 */
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { COMMAND_NAMES, UPSERT_TABLES, firstZodError, idSchema, type SessionUser, type SyncOpResult, type SyncTable, type PullResponse } from '@jn/shared';
import * as s from '../db/schema.js';
import { db, writeTx } from '../db/client.js';
import { HttpError } from '../lib/errors.js';
import { logError } from './audit.js';
import { notifyChange } from './bus.js';
import { makeCtx, type Ctx } from './context.js';
import { canReadTable, loadRecords, readableTables, SYNC_PG } from './records.js';
import { deleteRecord, upsertRecord } from './upserts.js';
import { createReceivables, setPortalLink, setQuoteStatus } from './quotes.js';
import { addJobNote, completeJob, consumeOnJob, jobFromQuote, moveStock, payEntry, setJobStatus } from './operations.js';

const opSchema = z.discriminatedUnion('type', [
  z.object({ opId: z.string().min(8).max(64), type: z.literal('upsert'), table: z.enum(UPSERT_TABLES), id: z.string().min(1).max(64), baseVersion: z.number().int().nullable(), data: z.record(z.string(), z.unknown()), at: z.string() }),
  z.object({ opId: z.string().min(8).max(64), type: z.literal('delete'), table: z.enum(UPSERT_TABLES), id: z.string().min(1).max(64), at: z.string() }),
  z.object({ opId: z.string().min(8).max(64), type: z.literal('command'), name: z.enum(COMMAND_NAMES), payload: z.record(z.string(), z.unknown()), at: z.string() }),
]);
export const pushSchema = z.object({ ops: z.array(z.unknown()).max(200) });

type Op = z.infer<typeof opSchema>;

async function execute(ctx: Ctx, op: Op) {
  if (op.type === 'upsert') return upsertRecord(ctx, op.table, op.id, op.data, op.baseVersion, op.opId);
  if (op.type === 'delete') return deleteRecord(ctx, op.table, op.id);
  const p = op.payload as Record<string, never>;
  const v = <T extends z.ZodTypeAny>(schema: T): z.infer<T> => {
    const r = schema.safeParse(op.payload);
    if (!r.success) throw new HttpError(400, firstZodError(r.error));
    return r.data;
  };
  switch (op.name) {
    case 'stock.move':
      return moveStock(ctx, p);
    case 'quote.setStatus':
      return setQuoteStatus(ctx, v(z.object({ quoteId: idSchema, status: z.enum(['draft', 'pending', 'approved', 'refused']), createReceivables: z.boolean().optional(), note: z.string().max(500).optional() })));
    case 'quote.createReceivables':
      return void (await createReceivables(ctx, v(z.object({ quoteId: idSchema, firstDueDate: z.string().optional() }))));
    case 'quote.portalLink':
      return setPortalLink(ctx, v(z.object({ quoteId: idSchema, token: z.string().max(128).nullable() })));
    case 'job.fromQuote':
      return jobFromQuote(ctx, p);
    case 'job.setStatus':
      return setJobStatus(ctx, p);
    case 'job.addNote':
      return addJobNote(ctx, p);
    case 'job.consume':
      return consumeOnJob(ctx, p);
    case 'job.complete':
      return completeJob(ctx, p);
    case 'finance.pay':
      return payEntry(ctx, p);
  }
}

async function recordsFor(user: SessionUser, touched: { table: SyncTable; id: string }[]) {
  const out: { table: SyncTable; record: Record<string, unknown> }[] = [];
  const byTable = new Map<SyncTable, string[]>();
  for (const t of touched) if (canReadTable(user, t.table)) byTable.set(t.table, [...(byTable.get(t.table) ?? []), t.id]);
  for (const [table, ids] of byTable) for (const record of await loadRecords(db(), table, ids)) out.push({ table, record });
  return out;
}

/** Estado atual (do servidor) dos registros que uma operação rejeitada tentou alterar. */
function targetsOf(op: Op): { table: SyncTable; id: string }[] {
  if (op.type !== 'command') return [{ table: op.table, id: op.id }];
  const p = op.payload as Record<string, string>;
  const t: { table: SyncTable; id: string }[] = [];
  if (p.productId) t.push({ table: 'products', id: p.productId });
  if (p.quoteId) t.push({ table: 'quotes', id: p.quoteId });
  if (p.jobId) t.push({ table: 'jobs', id: p.jobId });
  if (p.entryId) t.push({ table: 'financeEntries', id: p.entryId });
  return t;
}

export async function processOp(user: SessionUser, raw: unknown): Promise<SyncOpResult> {
  const parsed = opSchema.safeParse(raw);
  const opId = (raw as { opId?: string })?.opId ?? 'desconhecida';
  if (!parsed.success) return { opId, ok: false, error: 'Operação de sincronização inválida.' };
  const op = parsed.data;

  const [done] = await db().select().from(s.syncOps).where(eq(s.syncOps.opId, op.opId));
  if (done) {
    const prev = done.result as SyncOpResult;
    return { ...prev, duplicate: true, records: prev.ok ? await recordsFor(user, targetsOf(op)) : prev.records };
  }

  try {
    const touched = await writeTx(async (tx) => {
      const ctx = makeCtx(tx, user);
      await execute(ctx, op);
      await tx.insert(s.syncOps).values({ opId: op.opId, userId: user.id, kind: op.type === 'command' ? op.name : `${op.type}:${op.table}`, ok: true, result: { opId: op.opId, ok: true } });
      return ctx.touched;
    });
    notifyChange();
    return { opId: op.opId, ok: true, records: await recordsFor(user, touched) };
  } catch (err) {
    if (err instanceof HttpError && err.status < 500) {
      // rejeição de regra de negócio: definitiva — registrada para não reprocessar
      const result: SyncOpResult = { opId: op.opId, ok: false, error: err.message, conflict: err.status === 409 };
      try {
        await db().insert(s.syncOps).values({ opId: op.opId, userId: user.id, kind: op.type === 'command' ? op.name : `${op.type}:${op.table}`, ok: false, result: JSON.parse(JSON.stringify(result)) }).onConflictDoNothing();
      } catch {
        /* ignora */
      }
      await logError('sync.rejected', err, { op: { ...op, data: undefined } }, user.id);
      return { ...result, records: await recordsFor(user, targetsOf(op)) };
    }
    // erro inesperado (ex.: banco indisponível): cliente deve tentar novamente
    await logError('sync.error', err, { opId: op.opId }, user.id);
    throw err;
  }
}

export async function push(user: SessionUser, ops: unknown[]): Promise<SyncOpResult[]> {
  const results: SyncOpResult[] = [];
  for (const op of ops) results.push(await processOp(user, op)); // ordem preservada
  return results;
}

export async function pull(user: SessionUser, cursor: number, limit = 500): Promise<PullResponse> {
  const tables = readableTables(user);
  const lim = Math.min(Math.max(limit, 1), 1000);
  if (!tables.length) return { changes: [], cursor, hasMore: false, serverTime: new Date().toISOString() };
  const union = sql.join(
    tables.map((t) => sql`select ${t}::text as t, id, seq from ${sql.identifier(SYNC_PG[t].sqlName)} where seq > ${cursor}`),
    sql` union all `,
  );
  const r = await db().execute(sql`select t, id, seq from (${union}) x order by seq limit ${lim}`);
  const rows = r.rows as { t: SyncTable; id: string; seq: string | number }[];
  const byTable = new Map<SyncTable, string[]>();
  for (const row of rows) byTable.set(row.t, [...(byTable.get(row.t) ?? []), row.id]);
  const changes: PullResponse['changes'] = [];
  for (const [table, ids] of byTable) for (const record of await loadRecords(db(), table, ids)) changes.push({ table, record });
  changes.sort((a, b) => Number(a.record.seq) - Number(b.record.seq));
  const maxSeq = rows.length ? Math.max(...rows.map((x) => Number(x.seq))) : cursor;
  return { changes, cursor: maxSeq, hasMore: rows.length === lim, serverTime: new Date().toISOString() };
}

export async function lastSeq(): Promise<number> {
  const r = await db().execute(sql`select last_value::bigint as v, is_called from sync_seq`);
  const row = r.rows[0] as { v: string; is_called: boolean };
  return row.is_called ? Number(row.v) : 0;
}


