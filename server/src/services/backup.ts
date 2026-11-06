/**
 * Backups completos do banco em JSON compactado (gzip).
 * A restauração é NÃO destrutiva: cria um backup do estado atual e então
 * insere apenas os registros que não existem mais (nada é apagado ou sobrescrito).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { getTableColumns, getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import * as s from '../db/schema.js';
import { db, nextSeq, writeTx } from '../db/client.js';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';

/** Ordem compatível com as chaves estrangeiras. Sessões e tokens não entram no backup. */
const TABLES: PgTable[] = [
  s.users,
  s.settings,
  s.counters,
  s.clients,
  s.clientNotes,
  s.products,
  s.services,
  s.serviceMaterials,
  s.quotes,
  s.quoteItems,
  s.quoteMaterials,
  s.portalEvents,
  s.jobs,
  s.jobEvents,
  s.stockMovements,
  s.financeEntries,
  s.payments,
  s.activities,
  s.changeHistory,
  s.syncConflicts,
  s.errorLogs,
];

export interface BackupFile {
  app: 'jn-orcamentos';
  format: 1;
  createdAt: string;
  reason: string;
  tables: Record<string, unknown[]>;
}

export async function exportData(reason = 'exportacao'): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[getTableName(t)] = await db().select().from(t);
  return { app: 'jn-orcamentos', format: 1, createdAt: new Date().toISOString(), reason, tables };
}

export async function createBackup(reason = 'manual'): Promise<string> {
  fs.mkdirSync(config.backupDir, { recursive: true });
  const data = await exportData(reason);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(config.backupDir, `backup-${stamp}-${reason.replace(/[^a-z0-9-]/gi, '')}.json.gz`);
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(data)));
  pruneBackups();
  return path.basename(file);
}

/** Mantém os N backups automáticos mais recentes (manuais e pré-migração nunca são removidos). */
function pruneBackups() {
  const auto = listBackups().filter((b) => b.name.endsWith('-automatico.json.gz'));
  for (const b of auto.slice(config.backupKeep)) fs.unlinkSync(path.join(config.backupDir, b.name));
}

export function listBackups() {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs
    .readdirSync(config.backupDir)
    .filter((f) => /^backup-.*\.json\.gz$/.test(f))
    .map((name) => {
      const st = fs.statSync(path.join(config.backupDir, name));
      return { name, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function backupPath(name: string): string {
  if (!/^backup-[A-Za-z0-9-]+\.json\.gz$/.test(name)) throw badRequest('Nome de backup inválido.');
  const p = path.join(config.backupDir, name);
  if (!fs.existsSync(p)) throw badRequest('Backup não encontrado.');
  return p;
}

export function readBackup(buf: Buffer): BackupFile {
  let text: string;
  try {
    text = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  } catch {
    throw badRequest('Arquivo de backup corrompido.');
  }
  const data = JSON.parse(text) as BackupFile;
  if (data.app !== 'jn-orcamentos' || data.format !== 1 || typeof data.tables !== 'object') throw badRequest('Arquivo não é um backup válido do J&N Orçamentos.');
  return data;
}

/** Converte valores do JSON de volta aos tipos das colunas (datas). */
function revive(table: PgTable, row: Record<string, unknown>) {
  const cols = getTableColumns(table);
  const out: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(cols)) {
    if (!(key in row)) continue;
    const v = row[key];
    out[key] = col.columnType === 'PgTimestamp' && typeof v === 'string' ? new Date(v) : v;
  }
  return out;
}

/**
 * Restauração não destrutiva: insere somente registros ausentes. Registros
 * existentes permanecem intactos. Um backup do estado atual é criado antes.
 */
export async function restoreMissing(data: BackupFile) {
  const safety = await createBackup('pre-restauracao');
  const summary: Record<string, number> = {};
  await writeTx(async (tx) => {
    for (const t of TABLES) {
      const name = getTableName(t);
      const rows = (data.tables[name] ?? []) as Record<string, unknown>[];
      const cols = getTableColumns(t);
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200).map((r) => {
          const v = revive(t, r);
          if ('seq' in cols) v.seq = nextSeq; // novos para a sincronização
          return v;
        });
        if (!chunk.length) continue;
        const res = await tx.insert(t).values(chunk).onConflictDoNothing().returning();
        inserted += res.length;
      }
      summary[name] = inserted;
    }
  });
  return { safetyBackup: safety, inserted: summary };
}
