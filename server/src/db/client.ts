/**
 * Conexão com o banco.
 *  - Produção: PostgreSQL via DATABASE_URL (node-postgres).
 *  - Desenvolvimento sem PostgreSQL instalado: PGlite (PostgreSQL embutido em WebAssembly),
 *    persistido em DATA_DIR. Mesmo dialeto, mesmas migrações.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type Executor = DB | Tx;

let _db: DB | null = null;
let _close: (() => Promise<void>) | null = null;
export let dbKind: 'postgres' | 'pglite' = 'postgres';

export async function initDb(): Promise<DB> {
  if (_db) return _db;
  if (config.databaseUrl) {
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pg = await import('pg');
    const pool = new pg.default.Pool({ connectionString: config.databaseUrl, max: 10 });
    pool.on('error', (e) => console.error('[db] erro no pool', e));
    _db = drizzle(pool, { schema, casing: 'snake_case' });
    _close = () => pool.end();
    dbKind = 'postgres';
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const memory = process.env.PGLITE_MEMORY === 'true';
    if (!memory) fs.mkdirSync(config.dataDir, { recursive: true });
    const client = new PGlite(memory ? 'memory://' : path.join(config.dataDir, 'pglite'));
    _db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as DB;
    _close = () => client.close();
    dbKind = 'pglite';
  }
  return _db;
}

export function db(): DB {
  if (!_db) throw new Error('Banco não inicializado');
  return _db;
}

export async function closeDb() {
  await _close?.();
  _db = null;
  _close = null;
}

/** Lê o diário de migrações gerado pelo drizzle-kit. */
function journalCount(): number {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(config.migrationsDir, 'meta', '_journal.json'), 'utf8'));
    return j.entries.length;
  } catch {
    return 0;
  }
}

async function appliedCount(d: DB): Promise<number | null> {
  try {
    const r = await d.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    return Number((r.rows[0] as { n: number }).n);
  } catch {
    return null; // banco novo
  }
}

/**
 * Aplica migrações versionadas pendentes. Antes de migrar um banco que já possui
 * dados, cria um backup completo. Migrações nunca apagam dados (somente aditivas).
 */
export async function migrate(backupFn?: (reason: string) => Promise<string>) {
  const d = await initDb();
  const applied = await appliedCount(d);
  const total = journalCount();
  if (applied !== null && applied > 0 && applied < total && backupFn) {
    const file = await backupFn('pre-migracao');
    console.log(`[db] backup criado antes da migração: ${file}`);
  }
  if (dbKind === 'pglite') {
    const { migrate: m } = await import('drizzle-orm/pglite/migrator');
    await m(d as never, { migrationsFolder: config.migrationsDir });
  } else {
    const { migrate: m } = await import('drizzle-orm/node-postgres/migrator');
    await m(d, { migrationsFolder: config.migrationsDir });
  }
}

const WRITE_LOCK = 742001;

/**
 * Transação de escrita serializada (pg_advisory_xact_lock). Garante que a sequência
 * global `seq` seja confirmada em ordem — a sincronização incremental nunca perde alterações.
 */
export async function writeTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${WRITE_LOCK})`);
    return fn(tx);
  });
}

export const nextSeq = sql`nextval('sync_seq')`;
