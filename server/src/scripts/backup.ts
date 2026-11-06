/** Cria um backup completo do banco em BACKUP_DIR. */
import { closeDb, initDb } from '../db/client.js';
import { createBackup } from '../services/backup.js';
import { config } from '../config.js';

await initDb();
const name = await createBackup('manual');
console.log(`Backup criado: ${config.backupDir}/${name}`);
await closeDb();
