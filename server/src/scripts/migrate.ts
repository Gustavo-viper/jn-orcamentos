/** Aplica migrações pendentes (com backup automático antes, se o banco já tiver dados). */
import { closeDb, migrate } from '../db/client.js';
import { createBackup } from '../services/backup.js';
import { ensureSettings } from '../services/maintenance.js';

await migrate(createBackup);
await ensureSettings();
console.log('Migrações aplicadas com sucesso.');
await closeDb();
