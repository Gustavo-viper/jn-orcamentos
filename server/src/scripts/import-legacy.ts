/**
 * Importa os dados do sistema J&N anterior.
 *
 *   LEGACY_DATABASE_URL=postgres://...  (banco antigo — somente leitura)
 *   DATABASE_URL=postgres://...         (banco novo)
 *
 *   npm run import-legacy -w server            → SIMULAÇÃO (não grava nada)
 *   npm run import-legacy -w server -- --gravar → grava (faz backup do banco novo antes)
 */
import pg from 'pg';
import { closeDb, migrate } from '../db/client.js';
import { createBackup } from '../services/backup.js';
import { ensureSettings } from '../services/maintenance.js';
import { importLegacy, type LegacyRecord } from '../services/legacy-import.js';

const url = process.env.LEGACY_DATABASE_URL;
if (!url) {
  console.error('Defina LEGACY_DATABASE_URL com a conexão do banco antigo.');
  process.exit(1);
}
const write = process.argv.includes('--gravar');

const src = new pg.Client({ connectionString: url });
await src.connect();
// garante somente leitura na origem
await src.query('BEGIN READ ONLY');
const { rows } = await src.query<LegacyRecord>('select resource, record_id, data, is_deleted, updated_at from app_sync_records order by updated_at');
const users = await src
  .query<{ username: string; email: string | null }>('select username, email from app_users order by id')
  .then((r) => r.rows)
  .catch(() => []);
const legacyTables = await src.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' and table_name in ('quotes','clients','products','work_orders','finance_entries','stock_movements')");
const legacyCounts: Record<string, number> = {};
for (const t of legacyTables.rows) legacyCounts[t.table_name] = Number((await src.query(`select count(*)::int as n from "${t.table_name}"`)).rows[0].n);
await src.query('ROLLBACK');
await src.end();

await migrate(createBackup);
await ensureSettings();
if (write) console.log(`Backup do banco novo antes da importação: ${await createBackup('pre-importacao')}`);
const report = await importLegacy(rows, { dryRun: !write, legacyUsers: users });
console.log(JSON.stringify({ ...report, tabelasAntigasRelacionais: legacyCounts }, null, 2));
console.log(write ? '\nIMPORTAÇÃO GRAVADA.' : '\nSIMULAÇÃO concluída — nada foi gravado. Use --gravar para importar.');
await closeDb();
