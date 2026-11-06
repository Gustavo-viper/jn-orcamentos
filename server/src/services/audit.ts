import { activities, changeHistory, errorLogs } from '../db/schema.js';
import { db, type Executor } from '../db/client.js';
import { newId } from '../lib/ids.js';

export interface Actor {
  id: string | null;
  name: string;
}

export const SYSTEM_ACTOR: Actor = { id: null, name: 'Sistema' };
export const PORTAL_ACTOR: Actor = { id: null, name: 'Portal do cliente' };

/** Registra uma atividade visível no painel e no histórico de operações. */
export async function logActivity(tx: Executor, actor: Actor, action: string, entity: string, entityId: string | null, summary: string) {
  await tx.insert(activities).values({
    id: newId(),
    userId: actor.id,
    userName: actor.name,
    action,
    entity,
    entityId,
    summary,
  });
}

/** Grava o histórico de alterações (antes/depois) de um registro. */
export async function logChange(tx: Executor, actor: Actor, entity: string, entityId: string, action: string, before: unknown, after: unknown) {
  await tx.insert(changeHistory).values({
    id: newId(),
    entity,
    entityId,
    userId: actor.id,
    userName: actor.name,
    action,
    before: before == null ? null : JSON.parse(JSON.stringify(before)),
    after: after == null ? null : JSON.parse(JSON.stringify(after)),
  });
}

/** Registra erro em banco (sem falhar caso o próprio log falhe). */
export async function logError(source: string, err: unknown, detail?: unknown, userId?: string | null) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[erro:${source}]`, message);
  try {
    await db()
      .insert(errorLogs)
      .values({
        id: newId(),
        source,
        message: message.slice(0, 2000),
        detail: JSON.parse(JSON.stringify({ detail: detail ?? null, stack: err instanceof Error ? err.stack?.slice(0, 4000) : null })),
        userId: userId ?? null,
      });
  } catch {
    /* ignora falha de log */
  }
}
