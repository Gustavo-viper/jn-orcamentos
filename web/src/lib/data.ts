/**
 * Camada de dados do aplicativo: grava localmente (funciona offline), enfileira
 * para sincronização e aplica efeitos otimistas. O servidor valida tudo novamente.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DEFAULT_COMPANY,
  DEFAULT_QUOTE_SETTINGS,
  type CommandName,
  type CompanySettings,
  type QuoteSettings,
  type SyncTableMap,
  type UpsertTable,
} from '@jn/shared';
import { getDb, type OutboxEntry } from './db';
import { uuid } from './ids';
import { schedule } from './sync';

type Rec<T extends keyof SyncTableMap> = SyncTableMap[T] & { _syncError?: string | null };

const nowISO = () => new Date().toISOString();

/** Cria ou altera um registro. `patch` deve conter somente os campos alterados. */
/** `localExtra`: campos gravados apenas no aparelho (ex.: cálculo exibido enquanto o servidor recalcula). */
export async function saveRecord<T extends UpsertTable>(table: T, id: string, patch: Partial<SyncTableMap[T]>, description: string, localExtra?: Partial<SyncTableMap[T]>): Promise<Rec<T>> {
  const db = getDb();
  const t = db.table(table);
  let saved!: Rec<T>;
  await db.transaction('rw', t, db.outbox, async () => {
    const local = (await t.get(id)) as Rec<T> | undefined;
    const now = nowISO();
    saved = {
      ...(local ?? {}),
      ...patch,
      ...(localExtra ?? {}),
      id,
      createdAt: local?.createdAt ?? now,
      updatedAt: now,
      version: local?.version ?? 0,
      deletedAt: null,
      _syncError: null,
    } as unknown as Rec<T>;
    await t.put(saved);
    const entry: OutboxEntry = {
      opId: uuid(),
      op: { opId: '', type: 'upsert', table, id, baseVersion: local && local.version > 0 ? local.version : null, data: JSON.parse(JSON.stringify(patch)), at: now },
      targets: [id],
      status: 'pending',
      attempts: 0,
      createdAt: now,
      description,
    };
    entry.op.opId = entry.opId;
    await db.outbox.add(entry);
  });
  schedule();
  return saved;
}

/** Exclusão (lógica). Se o servidor recusar, o registro volta a aparecer. */
export async function deleteRecord(table: UpsertTable, id: string, description: string) {
  const db = getDb();
  const t = db.table(table);
  await db.transaction('rw', t, db.outbox, async () => {
    await t.update(id, { deletedAt: nowISO() });
    const opId = uuid();
    await db.outbox.add({ opId, op: { opId, type: 'delete', table, id, at: nowISO() }, targets: [id], status: 'pending', attempts: 0, createdAt: nowISO(), description });
  });
  schedule();
}

/** Envia um comando de negócio (estoque, aprovação, pagamento...) com efeito otimista opcional. */
export async function runCommand(name: CommandName, payload: Record<string, unknown>, opts: { targets: string[]; description: string; optimistic?: () => Promise<void> }) {
  const db = getDb();
  await db.transaction('rw', db.tables, async () => {
    await opts.optimistic?.();
    const opId = uuid();
    await db.outbox.add({ opId, op: { opId, type: 'command', name, payload: JSON.parse(JSON.stringify(payload)), at: nowISO() }, targets: opts.targets, status: 'pending', attempts: 0, createdAt: nowISO(), description: opts.description });
  });
  schedule();
}

// ---------------- Consultas reativas ----------------

const alive = <T extends { deletedAt?: string | null }>(r: T) => !r.deletedAt;

export function useTable<T extends keyof SyncTableMap>(table: T, deps: unknown[] = []): Rec<T>[] | undefined {
  return useLiveQuery(async () => ((await getDb().table(table).toArray()) as Rec<T>[]).filter(alive), [table, ...deps]);
}

export function useRecord<T extends keyof SyncTableMap>(table: T, id: string | undefined): Rec<T> | null | undefined {
  return useLiveQuery(async () => (id ? (((await getDb().table(table).get(id)) as Rec<T>) ?? null) : null), [table, id]);
}

export function useWhere<T extends keyof SyncTableMap>(table: T, index: string, value: string | undefined): Rec<T>[] | undefined {
  return useLiveQuery(
    async () => (value ? ((await getDb().table(table).where(index).equals(value).toArray()) as Rec<T>[]).filter(alive) : []),
    [table, index, value],
  );
}

export function useCompany(): CompanySettings {
  const r = useLiveQuery(() => getDb().settings.get('company'), []);
  return { ...DEFAULT_COMPANY, ...((r?.value as CompanySettings) ?? {}) };
}
export function useQuoteSettings(): QuoteSettings {
  const r = useLiveQuery(() => getDb().settings.get('quote'), []);
  return { ...DEFAULT_QUOTE_SETTINGS, ...((r?.value as QuoteSettings) ?? {}) };
}

export function usePendingOps() {
  return useLiveQuery(() => getDb().outbox.toArray(), []) ?? [];
}

export function useIsPending(id: string | undefined) {
  return (
    useLiveQuery(async () => (id ? (await getDb().outbox.where('status').equals('pending').toArray()).some((e) => e.targets.includes(id)) : false), [id]) ?? false
  );
}
