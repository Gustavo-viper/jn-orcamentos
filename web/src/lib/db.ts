/**
 * Banco local (IndexedDB via Dexie) — base do funcionamento offline.
 *
 * Regras de integridade:
 *  - um banco por usuário (dados de um usuário não aparecem para outro no mesmo aparelho);
 *  - o banco NUNCA é limpo em atualizações; novas versões de esquema são somente aditivas;
 *  - antes de qualquer atualização de esquema é feita uma cópia completa para um banco de backup;
 *  - registros só são removidos localmente quando o servidor envia exclusão lógica — e mesmo
 *    assim são mantidos com `deletedAt` (ocultos da interface).
 */
import Dexie, { type EntityTable } from 'dexie';
import type { SyncOp, SyncTableMap } from '@jn/shared';

export interface OutboxEntry {
  seq?: number;
  opId: string;
  op: SyncOp;
  /** ids dos registros afetados (não sobrescrever com dados do servidor enquanto pendente) */
  targets: string[];
  status: 'pending' | 'error';
  error?: string;
  attempts: number;
  createdAt: string;
  description: string;
}
export interface MetaEntry {
  key: string;
  value: unknown;
}
export interface DraftEntry {
  id: string;
  kind: string;
  data: unknown;
  updatedAt: string;
}

type Local<T> = T & { _syncError?: string | null };

export type AppDB = Dexie & {
  [K in keyof SyncTableMap]: EntityTable<Local<SyncTableMap[K]>, 'id'>;
} & {
  outbox: EntityTable<OutboxEntry, 'seq'>;
  meta: EntityTable<MetaEntry, 'key'>;
  drafts: EntityTable<DraftEntry, 'id'>;
};

/** Versão do esquema local. Ao alterar, adicione uma nova `.version()` — nunca remova tabelas. */
const SCHEMA_VERSION = 1;

function defineSchema(db: Dexie) {
  db.version(1).stores({
    clients: 'id, name, city, state, status, createdAt, seq',
    clientNotes: 'id, clientId, createdAt',
    products: 'id, name, category, code',
    stockMovements: 'id, productId, jobId, createdAt',
    services: 'id, name',
    quotes: 'id, number, clientId, status, issueDate, createdAt',
    jobs: 'id, number, clientId, quoteId, status, createdAt',
    jobEvents: 'id, jobId, createdAt',
    financeEntries: 'id, kind, status, dueDate, clientId, quoteId, jobId',
    payments: 'id, entryId, paidAt',
    settings: 'id',
    activities: 'id, createdAt',
    portalEvents: 'id, quoteId, createdAt',
    outbox: '++seq, opId, status',
    meta: 'key',
    drafts: 'id, kind, updatedAt',
  });
}

let current: AppDB | null = null;

/** Copia todas as tabelas do banco existente antes de atualizar a versão do esquema. */
async function backupBeforeUpgrade(name: string) {
  try {
    const list = (await indexedDB.databases?.()) ?? [];
    const info = list.find((d) => d.name === name);
    if (!info?.version || info.version >= SCHEMA_VERSION * 10) return;
    const old = new Dexie(name);
    await old.open(); // modo dinâmico: lê o esquema existente
    const backup = new Dexie(`${name}-backup-v${info.version}-${Date.now()}`);
    const stores: Record<string, string> = {};
    old.tables.forEach((t) => (stores[t.name] = t.schema.primKey.keyPath ? `${t.schema.primKey.auto ? '++' : ''}${t.schema.primKey.keyPath}` : '++'));
    backup.version(1).stores(stores);
    await backup.open();
    for (const t of old.tables) await backup.table(t.name).bulkPut(await t.toArray());
    backup.close();
    old.close();
    console.info('[db] backup local criado antes da atualização do esquema');
  } catch (e) {
    console.warn('[db] não foi possível criar backup local antes da atualização', e);
  }
}

export async function openUserDb(userId: string): Promise<AppDB> {
  const name = `jn-orcamentos-${userId}`;
  if (current?.name === name) return current;
  current?.close();
  await backupBeforeUpgrade(name);
  const db = new Dexie(name) as AppDB;
  defineSchema(db);
  await db.open();
  // pede ao navegador para não descartar os dados locais
  navigator.storage?.persist?.().catch(() => undefined);
  current = db;
  return db;
}

export function getDb(): AppDB {
  if (!current) throw new Error('Banco local não aberto');
  return current;
}

export function closeUserDb() {
  current?.close();
  current = null;
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const r = await getDb().meta.get(key);
  return (r?.value as T) ?? fallback;
}
export async function setMeta(key: string, value: unknown) {
  await getDb().meta.put({ key, value });
}
