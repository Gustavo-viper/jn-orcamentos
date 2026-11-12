import { Router, type Request } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { can, firstZodError, type Module, type SyncTable } from '@jn/shared';
import * as s from '../db/schema.js';
import { db, dbKind } from '../db/client.js';
import { config } from '../config.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { authenticate, requireAdmin } from '../services/auth.js';
import { addListener, listenerCount } from '../services/bus.js';
import { lastSeq, pull, push, pushSchema } from '../services/sync.js';
import { backupPath, createBackup, exportData, listBackups, readBackup, restoreMissing } from '../services/backup.js';
import { portalComment, portalDecision, portalStatus, portalView } from '../services/portal.js';
import { mailConfigured } from '../services/mailer.js';
import { logActivity } from '../services/audit.js';
import { writeTx } from '../db/client.js';

function parse<T extends z.ZodTypeAny>(schema: T, v: unknown): z.infer<T> {
  const r = schema.safeParse(v);
  if (!r.success) throw badRequest(firstZodError(r.error));
  return r.data;
}

// ---------------- Sincronização ----------------
export const syncRouter = Router();
syncRouter.use(authenticate);

syncRouter.post('/push', express.json({ limit: '5mb' }), async (req, res) => {
  const { ops } = parse(pushSchema, req.body);
  res.json({ results: await push(req.user!, ops) });
});

syncRouter.get('/pull', async (req, res) => {
  const cursor = Math.max(0, Number(req.query.cursor ?? 0) || 0);
  const limit = Number(req.query.limit ?? 500) || 500;
  res.json(await pull(req.user!, cursor, limit));
});

syncRouter.get('/status', async (_req, res) => {
  res.json({ serverSeq: await lastSeq(), serverTime: new Date().toISOString() });
});

// ---------------- Eventos em tempo real (SSE) ----------------
export const eventsRouter = Router();
eventsRouter.get('/', authenticate, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${Date.now()}\n\n`);
  addListener(res);
});

// ---------------- Histórico de alterações ----------------
const ENTITY_MODULE: Partial<Record<SyncTable, Module>> = {
  clients: 'clients',
  products: 'products',
  services: 'services',
  quotes: 'quotes',
  jobs: 'jobs',
  financeEntries: 'finance',
  settings: 'settings',
};
export const historyRouter = Router();
historyRouter.get('/:entity/:id', authenticate, async (req, res) => {
  const entity = String(req.params.entity) as SyncTable;
  const mod = ENTITY_MODULE[entity];
  if (!mod || !can(req.user, mod, 'view')) throw forbidden();
  const rows = await db()
    .select()
    .from(s.changeHistory)
    .where(and(eq(s.changeHistory.entity, entity), eq(s.changeHistory.entityId, String(req.params.id))))
    .orderBy(desc(s.changeHistory.createdAt))
    .limit(200);
  res.json({ history: rows });
});

// ---------------- Administração: status, backups, logs ----------------
export const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/status', async (req, res) => {
  const base = { ok: true, database: dbKind, serverSeq: await lastSeq(), realtimeClients: listenerCount(), mailConfigured: mailConfigured(), serverTime: new Date().toISOString() };
  if (req.user!.role !== 'admin') return res.json(base);
  const [ops] = await db().select({ n: sql<number>`count(*)::int` }).from(s.syncOps).where(gte(s.syncOps.receivedAt, new Date(Date.now() - 86400_000)));
  res.json({ ...base, opsLast24h: ops.n, backups: listBackups().slice(0, 1) });
});

adminRouter.get('/backups', requireAdmin, (_req, res) => res.json({ backups: listBackups(), dir: config.isProd ? undefined : config.backupDir }));

adminRouter.post('/backups', requireAdmin, async (req, res) => {
  const name = await createBackup('manual');
  await writeTx((tx) => logActivity(tx, { id: req.user!.id, name: req.user!.name }, 'system.backup', 'system', null, `Backup manual criado: ${name}`));
  res.json({ name });
});

adminRouter.get('/backups/:name', requireAdmin, (req, res) => {
  res.download(backupPath(String(req.params.name)));
});

adminRouter.get('/export', requireAdmin, async (req, res) => {
  const data = await exportData('exportacao');
  // senhas nunca saem na exportação
  data.tables.users = (data.tables.users as Record<string, unknown>[]).map(({ passwordHash: _p, ...u }) => u);
  res.setHeader('Content-Disposition', `attachment; filename="jn-orcamentos-exportacao-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(data);
  await writeTx((tx) => logActivity(tx, { id: req.user!.id, name: req.user!.name }, 'system.export', 'system', null, 'Exportação completa de dados realizada'));
});

/**
 * Restauração NÃO destrutiva: exige confirmação explícita digitada, cria backup
 * de segurança e somente insere registros ausentes (nada é apagado ou sobrescrito).
 */
adminRouter.post('/restore', requireAdmin, express.json({ limit: '200mb' }), async (req, res) => {
  const b = parse(z.object({ confirm: z.literal('RESTAURAR', { message: 'Digite RESTAURAR para confirmar.' }), backupName: z.string().optional(), fileBase64: z.string().optional() }), req.body);
  let buf: Buffer;
  if (b.backupName) {
    const fs = await import('node:fs');
    buf = fs.readFileSync(backupPath(b.backupName));
  } else if (b.fileBase64) buf = Buffer.from(b.fileBase64, 'base64');
  else throw badRequest('Selecione um backup.');
  const data = readBackup(buf);
  // usuários restaurados sem hash de senha (exportações) são ignorados
  data.tables.users = ((data.tables.users ?? []) as Record<string, unknown>[]).filter((u) => typeof u.passwordHash === 'string');
  const result = await restoreMissing(data);
  await writeTx((tx) => logActivity(tx, { id: req.user!.id, name: req.user!.name }, 'system.restore', 'system', null, `Restauração não destrutiva executada (backup de segurança: ${result.safetyBackup})`));
  res.json(result);
});

adminRouter.get('/logs', requireAdmin, async (_req, res) => {
  const errors = await db().select().from(s.errorLogs).orderBy(desc(s.errorLogs.createdAt)).limit(100);
  const conflicts = await db().select().from(s.syncConflicts).orderBy(desc(s.syncConflicts.createdAt)).limit(100);
  res.json({ errors, conflicts });
});

// ---------------- Portal do cliente (público) ----------------
export const portalRouter = Router();
const portalLimiter = rateLimit({ windowMs: 60_000, limit: config.isTest ? 1000 : 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas requisições. Aguarde um instante.' } });
portalRouter.use(portalLimiter);
const meta = (req: Request) => ({ ip: req.ip ?? '', ua: String(req.headers['user-agent'] ?? '') });

portalRouter.get('/:token/status', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await portalStatus(String(req.params.token)));
});

portalRouter.get('/:token', async (req, res) => {
  const m = meta(req);
  res.set('Cache-Control', 'no-store');
  res.json(await portalView(String(req.params.token), m.ip, m.ua));
});

portalRouter.post('/:token/decision', async (req, res) => {
  const b = parse(z.object({ decision: z.enum(['approve', 'refuse']), name: z.string().max(120).default(''), message: z.string().max(2000).default('') }), req.body);
  const m = meta(req);
  res.json(await portalDecision(String(req.params.token), b.decision, b.name, b.message, m.ip, m.ua));
});

portalRouter.post('/:token/comment', async (req, res) => {
  const b = parse(z.object({ name: z.string().max(120).default(''), message: z.string().min(1, 'Escreva sua mensagem').max(2000) }), req.body);
  const m = meta(req);
  await portalComment(String(req.params.token), b.name, b.message, m.ip, m.ua);
  res.json({ ok: true });
});
