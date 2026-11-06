import type { NextFunction, Request, Response } from 'express';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { sanitizePermissions, type SessionUser } from '@jn/shared';
import * as s from '../db/schema.js';
import { db } from '../db/client.js';
import { config } from '../config.js';
import { newId, newToken, sha256 } from '../lib/ids.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export const SESSION_COOKIE = 'jn_session';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
    sessionId?: string;
  }
}

export function toSessionUser(u: typeof s.users.$inferSelect): SessionUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    permissions: sanitizePermissions(u.permissions),
    active: u.active,
    mustChangePassword: u.mustChangePassword,
  };
}

export async function createSession(res: Response, req: Request, userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.sessionDays * 86400_000);
  await db()
    .insert(s.sessions)
    .values({ id: newId(), userId, tokenHash: sha256(token), expiresAt, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300), ip: req.ip ?? '' });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    expires: expiresAt,
    path: '/',
  });
}

export async function revokeSession(token: string | undefined) {
  if (!token) return;
  await db().update(s.sessions).set({ revokedAt: new Date() }).where(eq(s.sessions.tokenHash, sha256(token)));
}

export async function revokeAllSessions(userId: string) {
  await db().update(s.sessions).set({ revokedAt: new Date() }).where(and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt)));
}

/** Autentica a requisição pelo cookie de sessão. Usuários desativados são bloqueados. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw unauthorized();
    const [row] = await db()
      .select({ session: s.sessions, user: s.users })
      .from(s.sessions)
      .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
      .where(and(eq(s.sessions.tokenHash, sha256(token)), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, new Date())));
    if (!row) throw unauthorized();
    if (!row.user.active) throw unauthorized('Seu acesso está desativado. Fale com o administrador.');
    req.user = toSessionUser(row.user);
    req.sessionId = row.session.id;
    if (Date.now() - row.session.lastSeenAt.getTime() > 5 * 60_000)
      await db().update(s.sessions).set({ lastSeenAt: new Date() }).where(eq(s.sessions.id, row.session.id));
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return next(forbidden('Somente administradores.'));
  next();
}

/** Proteção CSRF: toda escrita na API exige o cabeçalho enviado pelo próprio aplicativo. */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.headers['x-jn-client'] !== '1') return next(forbidden('Requisição bloqueada (CSRF).'));
  next();
}

export async function countUsers(): Promise<number> {
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(s.users);
  return r.n;
}

export async function findUserByEmail(email: string) {
  const [u] = await db().select().from(s.users).where(sql`lower(${s.users.email}) = ${email.trim().toLowerCase()}`);
  return u ?? null;
}
