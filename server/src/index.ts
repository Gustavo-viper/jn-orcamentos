import { config } from './config.js';
import { closeDb, dbKind, migrate } from './db/client.js';
import { createApp } from './app.js';
import { createBackup } from './services/backup.js';
import { ensureSettings, startMaintenance } from './services/maintenance.js';

async function main() {
  await migrate(createBackup);
  await ensureSettings();
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
