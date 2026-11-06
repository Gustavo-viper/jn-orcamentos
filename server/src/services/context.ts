import { sql } from 'drizzle-orm';
import { can, type Action, type Module, type SessionUser, type SyncTable } from '@jn/shared';
import { counters } from '../db/schema.js';
import { nextSeq, type Tx } from '../db/client.js';
import { forbidden } from '../lib/errors.js';
import type { Actor } from './audit.js';

/** Contexto de uma operação de escrita. */
export interface Ctx {
  tx: Tx;
  user: SessionUser;
  actor: Actor;
  /** registros afetados — devolvidos ao cliente para atualizar o estado local */
  touched: { table: SyncTable; id: string }[];
}

export function makeCtx(tx: Tx, user: SessionUser): Ctx {
  return { tx, user, actor: { id: user.id, name: user.name }, touched: [] };
}

export function touch(ctx: Ctx, table: SyncTable, id: string) {
  if (!ctx.touched.some((t) => t.table === table && t.id === id)) ctx.touched.push({ table, id });
}

export function requirePerm(ctx: Pick<Ctx, 'user'>, module: Module, action: Action) {
  if (!can(ctx.user, module, action)) throw forbidden(`Sem permissão: ${action} em ${module}.`);
}

/** Colunas atualizadas em toda escrita de registro sincronizável. */
export function bump(table: { version: unknown }) {
  return { updatedAt: new Date(), version: sql`${table.version} + 1`, seq: nextSeq } as Record<string, unknown>;
}

/** Próximo número sequencial (orçamentos, OS). Executado dentro da transação de escrita. */
export async function nextNumber(tx: Tx, name: string): Promise<number> {
  const r = await tx
    .insert(counters)
    .values({ name, value: 1 })
    .onConflictDoUpdate({ target: counters.name, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  return r[0].value;
}
