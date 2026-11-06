/**
 * Cria (ou reativa e redefine a senha de) um administrador pela linha de comando.
 * Uso: npm run create-admin -w server -- "Nome" email@empresa.com "SenhaForte123"
 */
import { eq } from 'drizzle-orm';
import { passwordSchema } from '@jn/shared';
import * as s from '../db/schema.js';
import { closeDb, db, migrate } from '../db/client.js';
import { hashPassword, newId } from '../lib/ids.js';
import { findUserByEmail } from '../services/auth.js';

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password) {
  console.error('Uso: npm run create-admin -w server -- "Nome" email@empresa.com "SenhaForte123"');
  process.exit(1);
}
const pw = passwordSchema.safeParse(password);
if (!pw.success) {
  console.error(pw.error.issues[0].message);
  process.exit(1);
}
await migrate();
const existing = await findUserByEmail(email);
if (existing) {
  await db().update(s.users).set({ role: 'admin', active: true, passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(s.users.id, existing.id));
  console.log(`Usuário ${email} promovido a administrador e senha redefinida.`);
} else {
  await db().insert(s.users).values({ id: newId(), name, email: email.toLowerCase(), passwordHash: await hashPassword(password), role: 'admin', permissions: {} });
  console.log(`Administrador ${email} criado.`);
}
await closeDb();
