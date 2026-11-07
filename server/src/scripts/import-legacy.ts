/**
 * Importa os dados do sistema J&N anterior.
 *
 *   LEGACY_DATABASE_URL=postgres://...  (banco antigo — somente leitura)
 *   DATABASE_URL=postgres://...         (banco novo)
 *
 *   npm run import-legacy -w server            → SIMULAÇÃO (não grava nada)
 *   npm run import-legacy -w server -- --gravar → grava (faz backup do banco novo antes)
 */
import { closeDb, migrate } from '../db/client.js';
import { createBackup } from '../services/backup.js';
import { ensureSettings } from '../services/maintenance.js';
import { runLegacyImport } from '../services/legacy-import.js';

const url = process.env.LEGACY_DATABASE_URL;
if (!url) {
  console.error('Defina LEGACY_DATABASE_URL com a conexão do banco antigo.');
  process.exit(1);
}
const write = process.argv.includes('--gravar');

await migrate(createBackup);
await ensureSettings();
if (write) console.log(`Backup do banco novo antes da importação: ${await createBackup('pre-importacao')}`);
const report = await runLegacyImport(url, write);
console.log(JSON.stringify(report, null, 2));
console.log(write ? '\nIMPORTAÇÃO GRAVADA.' : '\nSIMULAÇÃO concluída — nada foi gravado. Use --gravar para importar.');
await closeDb();
