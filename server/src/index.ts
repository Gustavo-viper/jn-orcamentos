import { config } from './config.js';
import { closeDb, dbKind, migrate } from './db/client.js';
import { createApp } from './app.js';
import { createBackup } from './services/backup.js';
import { ensureSettings, startMaintenance } from './services/maintenance.js';
import { runLegacyImport } from './services/legacy-import.js';

async function main() {
  await migrate(createBackup);
  await ensureSettings();
  // Importação do sistema anterior controlada por variável (simulacao | gravar).
  const mode = process.env.LEGACY_IMPORT_MODE;
  if ((mode === 'simulacao' || mode === 'gravar') && process.env.LEGACY_DATABASE_URL) {
    try {
      const write = mode === 'gravar';
      if (write) console.log(`[importacao] backup antes: ${await createBackup('pre-importacao')}`);
      const report = await runLegacyImport(process.env.LEGACY_DATABASE_URL, write);
      console.log(`[importacao] RELATORIO ${JSON.stringify(report)}`);
    } catch (e) {
      console.error('[importacao] FALHOU — nada foi gravado:', e);
    }
  }
  startMaintenance();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`J&N Orçamentos — API em http://localhost:${config.port} (banco: ${dbKind}${dbKind === 'pglite' ? `, dados em ${config.dataDir}` : ''})`);
  });
  const shutdown = async () => {
    console.log('Encerrando...');
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('Falha ao iniciar o servidor:', e);
  process.exit(1);
});
