import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;
const here = path.dirname(fileURLToPath(import.meta.url));
// src/ (dev) ou dist/ (produção) → raiz do pacote server
const root = path.resolve(here, '..');

export const config = {
  env: env.NODE_ENV ?? 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT ?? 3001),
  /** URL pública do aplicativo (usada em links do portal e e-mails) */
  appUrl: (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  /** PostgreSQL. Se ausente, usa PGlite (Postgres embutido) em DATA_DIR. */
  databaseUrl: env.DATABASE_URL ?? '',
  dataDir: path.resolve(env.DATA_DIR ?? path.join(root, 'data')),
  backupDir: path.resolve(env.BACKUP_DIR ?? path.join(root, 'backups')),
  sessionDays: Number(env.SESSION_DAYS ?? 30),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
  trustProxy: env.TRUST_PROXY === 'true',
  smtp: {
    host: env.SMTP_HOST ?? '',
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER ?? '',
    pass: env.SMTP_PASS ?? '',
    from: env.SMTP_FROM ?? 'J&N Orçamentos <no-reply@localhost>',
  },
  webDist: path.resolve(env.WEB_DIST ?? path.join(root, '..', 'web', 'dist')),
  migrationsDir: path.resolve(env.MIGRATIONS_DIR ?? path.join(root, 'drizzle')),
  /** backup automático a cada N horas (0 desativa) */
  autoBackupHours: Number(env.AUTO_BACKUP_HOURS ?? 24),
  backupKeep: Number(env.BACKUP_KEEP ?? 30),
};
