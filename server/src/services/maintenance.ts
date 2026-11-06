import { and, eq, lt } from 'drizzle-orm';
import { formatQuoteNumber, todayISO, DEFAULT_COMPANY, DEFAULT_QUOTE_SETTINGS } from '@jn/shared';
import * as s from '../db/schema.js';
import { db, writeTx } from '../db/client.js';
import { config } from '../config.js';
import { logActivity, logError, SYSTEM_ACTOR } from './audit.js';
import { bump } from './context.js';
import { notifyChange } from './bus.js';
import { createBackup } from './backup.js';

/** Marca como expirados os orçamentos pendentes cuja validade passou. */
export async function expireQuotes() {
  const today = todayISO();
  const due = await db()
    .select({ id: s.quotes.id, number: s.quotes.number })
    .from(s.quotes)
    .where(and(eq(s.quotes.status, 'pending'), lt(s.quotes.validUntil, today)));
  if (!due.length) return 0;
  await writeTx(async (tx) => {
    for (const q of due) {
      await tx.update(s.quotes).set({ status: 'expired', ...bump(s.quotes) }).where(and(eq(s.quotes.id, q.id), eq(s.quotes.status, 'pending')));
      await logActivity(tx, SYSTEM_ACTOR, 'quote.expired', 'quotes', q.id, `Orçamento ${formatQuoteNumber(q.number)} expirou`);
    }
  });
  notifyChange();
  return due.length;
}

/** Garante que existam as configurações padrão (sem sobrescrever as existentes). */
export async function ensureSettings() {
  await db().insert(s.settings).values({ id: 'company', value: DEFAULT_COMPANY }).onConflictDoNothing();
  await db().insert(s.settings).values({ id: 'quote', value: DEFAULT_QUOTE_SETTINGS }).onConflictDoNothing();
}

export function startMaintenance() {
  const run = () => expireQuotes().catch((e) => logError('maintenance.expire', e));
  run();
  setInterval(run, 60 * 60_000).unref();
  if (config.autoBackupHours > 0) {
    setInterval(
      () => createBackup('automatico').catch((e) => logError('maintenance.backup', e)),
      config.autoBackupHours * 3600_000,
    ).unref();
  }
}
