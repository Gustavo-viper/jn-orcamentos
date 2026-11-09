import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DEFAULT_EMPLOYEE_PERMISSIONS, firstZodError, passwordSchema, sanitizePermissions } from '@jn/shared';
import * as s from '../db/schema.js';
import { db, writeTx } from '../db/client.js';
import { config } from '../config.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { timingSafeEqual } from 'node:crypto';
import { hashPassword, newId, newToken, sha256, verifyPassword } from '../lib/ids.js';
import { logActivity } from '../services/audit.js';
import {
  authenticate,
  countUsers,
  createSession,
  findUserByEmail,
  requireAdmin,
  revokeAllSessions,
  revokeSession,
  SESSION_COOKIE,
  toSessionUser,
} from '../services/auth.js';
import { mailConfigured, sendMail } from '../services/mailer.js';

function parse<T extends z.ZodTypeAny>(schema: T, v: unknown): z.infer<T> {
  const r = schema.safeParse(v);
  if (!r.success) throw badRequest(firstZodError(r.error));
  return r.data;
}

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: config.isTest ? 1000 : 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde alguns minutos.' } });

export const authRouter = Router();

/** Código exigido para criar conta pela tela de login (SIGNUP_CODE ou o APP_ENROLLMENT_CODE do sistema anterior). */
const signupCode = () => (process.env.SIGNUP_CODE || process.env.APP_ENROLLMENT_CODE || '').trim();
function codeMatches(given: string) {
  const expected = signupCode();
  if (!expected) return false;
  const a = Buffer.from(sha256(given.trim().toUpperCase()));
  const b = Buffer.from(sha256(expected.toUpperCase()));
  return timingSafeEqual(a, b);
}

authRouter.get('/setup-status', async (_req, res) => {
  res.json({ needsSetup: (await countUsers()) === 0, mailConfigured: mailConfigured(), signupEnabled: !!signupCode() });
});

/**
 * Cadastro pela tela de login. As contas são de administrador (uso interno da J&N),
 * por isso exigem o código de cadastro — sem ele, ninguém de fora consegue criar conta.
 * Não há limite de quantidade de contas.
 */
const registerLimiter = rateLimit({ windowMs: 60 * 60_000, limit: config.isTest ? 1000 : 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas tentativas de cadastro. Aguarde e tente novamente.' } });
authRouter.post('/register', registerLimiter, async (req, res) => {
  const b = parse(
    z.object({ name: z.string().trim().min(2, 'Informe seu nome').max(120), email: z.string().trim().email('E-mail inválido'), password: passwordSchema, code: z.string().max(200).default('') }),
    req.body,
  );
  if (!signupCode()) throw forbidden('O cadastro de contas está desativado. Peça a um administrador para criar seu acesso.');
  if (!codeMatches(b.code)) throw forbidden('Código de cadastro incorreto.');
  if (await findUserByEmail(b.email)) throw conflict('Já existe uma conta com este e-mail. Use "Entrar" ou "Esqueci minha senha".');
  const id = newId();
  await db().insert(s.users).values({ id, name: b.name, email: b.email.toLowerCase(), passwordHash: await hashPassword(b.password), role: 'admin', permissions: {} });
  await writeTx((tx) => logActivity(tx, { id, name: b.name }, 'users.register', 'users', id, `${b.name} criou a própria conta (administrador) pela tela de cadastro`));
  await createSession(res, req, id);
  const [u] = await db().select().from(s.users).where(eq(s.users.id, id));
  res.json({ user: toSessionUser(u) });
});

/** Cria o primeiro administrador. Disponível somente enquanto não houver usuários. */
authRouter.post('/setup', loginLimiter, async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email('E-mail inválido'), password: passwordSchema }), req.body);
  const id = newId();
  await writeTx(async (tx) => {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.users);
    if (r.n > 0) throw conflict('O sistema já foi configurado.');
    await tx.insert(s.users).values({ id, name: b.name, email: b.email.toLowerCase(), passwordHash: await hashPassword(b.password), role: 'admin', permissions: {} });
    await logActivity(tx, { id, name: b.name }, 'auth.setup', 'users', id, `Administrador ${b.name} criado na configuração inicial`);
  });
  await createSession(res, req, id);
  const [u] = await db().select().from(s.users).where(eq(s.users.id, id));
  res.json({ user: toSessionUser(u) });
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const b = parse(z.object({ email: z.string().trim().min(3), password: z.string().min(1).max(200) }), req.body);
  const u = await findUserByEmail(b.email);
  // mesma mensagem para usuário inexistente ou senha errada
  if (!u || !(await verifyPassword(b.password, u.passwordHash))) throw unauthorized('E-mail ou senha incorretos.');
  if (!u.active) throw forbidden('Seu acesso está desativado. Fale com o administrador.');
  await createSession(res, req, u.id);
  await db().update(s.users).set({ lastLoginAt: new Date() }).where(eq(s.users.id, u.id));
  await writeTx((tx) => logActivity(tx, { id: u.id, name: u.name }, 'auth.login', 'users', u.id, `${u.name} entrou no sistema`));
  res.json({ user: toSessionUser(u) });
});

authRouter.post('/logout', async (req, res) => {
  await revokeSession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post('/forgot', loginLimiter, async (req, res) => {
  const b = parse(z.object({ email: z.string().trim().min(3) }), req.body);
  const u = await findUserByEmail(b.email);
  if (u && u.active) {
    const token = newToken();
    await db().insert(s.passwordResets).values({ id: newId(), userId: u.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) });
    const link = `${config.appUrl}/redefinir-senha?token=${token}`;
    await sendMail(u.email, 'J&N Orçamentos — redefinição de senha', `Olá, ${u.name}.\n\nPara criar uma nova senha, acesse o link abaixo (válido por 1 hora):\n${link}\n\nSe você não solicitou, ignore este e-mail.`);
  }
  // resposta idêntica para não revelar quais e-mails existem
  res.json({ ok: true, mailConfigured: mailConfigured() });
});

authRouter.post('/reset', loginLimiter, async (req, res) => {
  const b = parse(z.object({ token: z.string().min(20).max(200), password: passwordSchema }), req.body);
  const [r] = await db()
    .select()
    .from(s.passwordResets)
    .where(and(eq(s.passwordResets.tokenHash, sha256(b.token)), isNull(s.passwordResets.usedAt), gt(s.passwordResets.expiresAt, new Date())));
  if (!r) throw badRequest('Link de redefinição inválido ou expirado.');
  await db().update(s.users).set({ passwordHash: await hashPassword(b.password), mustChangePassword: false, updatedAt: new Date() }).where(eq(s.users.id, r.userId));
  await db().update(s.passwordResets).set({ usedAt: new Date() }).where(eq(s.passwordResets.id, r.id));
  await revokeAllSessions(r.userId);
  res.json({ ok: true });
});

authRouter.post('/change-password', authenticate, async (req, res) => {
  const b = parse(z.object({ current: z.string().min(1), password: passwordSchema }), req.body);
  const [u] = await db().select().from(s.users).where(eq(s.users.id, req.user!.id));
  if (!(await verifyPassword(b.current, u.passwordHash))) throw badRequest('Senha atual incorreta.');
  await db().update(s.users).set({ passwordHash: await hashPassword(b.password), mustChangePassword: false, updatedAt: new Date() }).where(eq(s.users.id, u.id));
  // encerra as demais sessões, mantém a atual
  await db().update(s.sessions).set({ revokedAt: new Date() }).where(and(eq(s.sessions.userId, u.id), isNull(s.sessions.revokedAt), ne(s.sessions.id, req.sessionId!)));
  await writeTx((tx) => logActivity(tx, { id: u.id, name: u.name }, 'auth.password', 'users', u.id, `${u.name} alterou a própria senha`));
  res.json({ ok: true });
});

// ---------------- Gestão de usuários (administrador) ----------------
export const usersRouter = Router();
usersRouter.use(authenticate, requireAdmin);

const publicUser = (u: typeof s.users.$inferSelect) => ({ ...toSessionUser(u), lastLoginAt: u.lastLoginAt, createdAt: u.createdAt });

usersRouter.get('/', async (_req, res) => {
  const list = await db().select().from(s.users).orderBy(s.users.name);
  res.json({ users: list.map(publicUser) });
});

usersRouter.post('/', async (req, res) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email('E-mail inválido'),
      password: passwordSchema,
      role: z.enum(['admin', 'employee']).default('employee'),
      permissions: z.unknown().optional(),
    }),
    req.body,
  );
  if (await findUserByEmail(b.email)) throw conflict('Já existe um usuário com este e-mail.');
  const id = newId();
  await db().insert(s.users).values({
    id,
    name: b.name,
    email: b.email.toLowerCase(),
    passwordHash: await hashPassword(b.password),
    role: b.role,
    permissions: b.permissions ? sanitizePermissions(b.permissions) : DEFAULT_EMPLOYEE_PERMISSIONS,
    mustChangePassword: true,
  });
  await writeTx((tx) => logActivity(tx, { id: req.user!.id, name: req.user!.name }, 'users.create', 'users', id, `Usuário ${b.name} cadastrado (${b.role === 'admin' ? 'administrador' : 'funcionário'})`));
  const [u] = await db().select().from(s.users).where(eq(s.users.id, id));
  res.json({ user: publicUser(u) });
});

async function activeAdmins(exceptId: string) {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(s.users)
    .where(and(eq(s.users.role, 'admin'), eq(s.users.active, true), ne(s.users.id, exceptId)));
  return r.n;
}

usersRouter.patch('/:id', async (req, res) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(2).max(120).optional(),
      email: z.string().trim().email().optional(),
      role: z.enum(['admin', 'employee']).optional(),
      permissions: z.unknown().optional(),
      active: z.boolean().optional(),
    }),
    req.body,
  );
  const [u] = await db().select().from(s.users).where(eq(s.users.id, String(req.params.id)));
  if (!u) throw notFound('Usuário não encontrado.');
  const demoting = (b.role && b.role !== 'admin') || b.active === false;
  if (u.role === 'admin' && demoting && (await activeAdmins(u.id)) === 0) throw conflict('É necessário manter pelo menos um administrador ativo.');
  if (b.email && b.email.toLowerCase() !== u.email) {
    const other = await findUserByEmail(b.email);
    if (other && other.id !== u.id) throw conflict('Já existe um usuário com este e-mail.');
  }
  await db()
    .update(s.users)
    .set({
      ...(b.name ? { name: b.name } : {}),
      ...(b.email ? { email: b.email.toLowerCase() } : {}),
      ...(b.role ? { role: b.role } : {}),
      ...(b.permissions !== undefined ? { permissions: sanitizePermissions(b.permissions) } : {}),
      ...(b.active !== undefined ? { active: b.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(s.users.id, u.id));
  if (b.active === false) await revokeAllSessions(u.id); // bloqueio imediato
  await writeTx((tx) =>
    logActivity(tx, { id: req.user!.id, name: req.user!.name }, 'users.update', 'users', u.id, `Usuário ${u.name} alterado${b.active === false ? ' (acesso desativado)' : b.active === true ? ' (acesso reativado)' : ''}`),
  );
  const [after] = await db().select().from(s.users).where(eq(s.users.id, u.id));
  res.json({ user: publicUser(after) });
});

usersRouter.post('/:id/password', async (req, res) => {
  const b = parse(z.object({ password: passwordSchema }), req.body);
  const [u] = await db().select().from(s.users).where(eq(s.users.id, String(req.params.id)));
  if (!u) throw notFound('Usuário não encontrado.');
  await db().update(s.users).set({ passwordHash: await hashPassword(b.password), mustChangePassword: true, updatedAt: new Date() }).where(eq(s.users.id, u.id));
  await revokeAllSessions(u.id);
  await writeTx((tx) => logActivity(tx, { id: req.user!.id, name: req.user!.name }, 'users.password', 'users', u.id, `Senha do usuário ${u.name} redefinida pelo administrador`));
  res.json({ ok: true });
});
