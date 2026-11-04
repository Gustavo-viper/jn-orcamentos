const ACCOUNTS_KEY = "jn-gesso:accounts-v1";
const SESSION_KEY = "jn-gesso:session-v1";
const TOKEN_KEY = "jn-gesso:cloud-token-v1";
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

export const ALLOWED_USERS = ["Jefersson", "Giovane"] as const;
export type AppUser = (typeof ALLOWED_USERS)[number];
type Account = { user: AppUser; salt: string; passwordHash: string };

function readAccounts(): Account[] {
  try {
    const value = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]") as Account[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const digest = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: Uint8Array.from(salt.match(/.{2}/g) ?? [], (byte) => parseInt(byte, 16)), iterations: 120_000 }, key, 256);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function matchUser(name: string): AppUser | undefined {
  return ALLOWED_USERS.find((user) => user.toLocaleLowerCase("pt-BR") === name.trim().toLocaleLowerCase("pt-BR"));
}

export function getAccounts() {
  return readAccounts().map((account) => account.user);
}

export function getCurrentUser(): AppUser | null {
  const value = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
  if (API_URL && typeof navigator !== "undefined" && navigator.onLine && !localStorage.getItem(TOKEN_KEY)) return null;
  return value && ALLOWED_USERS.includes(value as AppUser) ? (value as AppUser) : null;
}

export async function validateCurrentSession() {
  if (!API_URL) return getCurrentUser();
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const response = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) { signOut(); return null; }
    const { user } = await response.json() as { user: AppUser };
    return ALLOWED_USERS.includes(user) ? user : null;
  } catch {
    // Backend indisponível: mantém o acesso offline no dispositivo atual.
    return getCurrentUser();
  }
}

export async function createAccount(name: string, password: string, enrollmentCode = "") {
  const user = matchUser(name);
  if (!user) throw new Error("As contas disponíveis são Jefersson e Giovane.");
  if (password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  const accounts = readAccounts();
  if (!API_URL) throw new Error("O servidor de contas não está configurado.");
  const normalizedEnrollmentCode = enrollmentCode.trim().replace(/[\s-]/g, "").toUpperCase();
  const response = await fetch(`${API_URL}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: user, password, enrollmentCode: normalizedEnrollmentCode }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível criar a conta.");
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const existingIndex = accounts.findIndex((account) => account.user === user);
  const newAccount = { user, salt, passwordHash: await hashPassword(password, salt) };
  if (existingIndex >= 0) accounts[existingIndex] = newAccount;
  else accounts.push(newAccount);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  localStorage.setItem(SESSION_KEY, user);
  localStorage.setItem(TOKEN_KEY, result.token);
  return user;
}

export async function signIn(name: string, password: string) {
  const user = matchUser(name);
  if (!user) throw new Error("Selecione Jefersson ou Giovane.");
  const account = readAccounts().find((item) => item.user === user);
  if (API_URL) {
    try {
      const response = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: user, password }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        localStorage.setItem(SESSION_KEY, user);
        localStorage.setItem(TOKEN_KEY, result.token);
        if (!account) {
          const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
          const accounts = readAccounts();
          accounts.push({ user, salt, passwordHash: await hashPassword(password, salt) });
          localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
        }
        return user;
      }
      if (response.status !== 0) throw new Error(result.error || "Senha incorreta.");
    } catch (error) {
      if (error instanceof Error && error.message !== "Failed to fetch") throw error;
    }
  }
  if (!account) throw new Error(`Crie a conta de ${user} enquanto estiver online antes de usar sem internet.`);
  if (account.passwordHash !== await hashPassword(password, account.salt)) throw new Error("Senha incorreta.");
  localStorage.setItem(SESSION_KEY, user);
  return user;
}

export async function resetPassword(name: string, recoveryCode: string, password: string) {
  const user = matchUser(name);
  if (!user) throw new Error("Selecione Jefersson ou Giovane.");
  if (password.length < 8) throw new Error("A nova senha precisa ter pelo menos 8 caracteres.");
  if (!API_URL) throw new Error("O servidor de recuperação de senha não está configurado.");

  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: user, recoveryCode, password }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível redefinir a senha.");

  const accounts = readAccounts();
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const updated = { user, salt, passwordHash: await hashPassword(password, salt) };
  const index = accounts.findIndex((account) => account.user === user);
  if (index >= 0) accounts[index] = updated;
  else accounts.push(updated);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  signOut();
}

export function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);
}
