import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { can, type Action, type Module, type SessionUser } from '@jn/shared';
import { api, ApiError } from './api';
import { closeUserDb, openUserDb } from './db';
import { startSync, stopSync, syncStore } from './sync';

const KEY = 'jn_user';

interface AuthCtx {
  user: SessionUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  setupAdmin: (name: string, email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (m: Module, a?: Action) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

function cached(): SessionUser | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const sync = useSyncExternalStore(syncStore.subscribe, syncStore.get);

  const enter = useCallback(async (u: SessionUser) => {
    localStorage.setItem(KEY, JSON.stringify(u));
    await openUserDb(u.id);
    setUser(u);
    await startSync();
  }, []);

  const leave = useCallback(() => {
    // os dados locais NÃO são apagados — apenas a sessão é encerrada
    stopSync();
    closeUserDb();
    localStorage.removeItem(KEY);
    setUser(null);
  }, []);

  // inicialização: abre imediatamente com o usuário em cache (funciona offline)
  useEffect(() => {
    (async () => {
      const c = cached();
      if (c) {
        await enter(c);
        setReady(true);
        try {
          const { user: fresh } = await api<{ user: SessionUser }>('/auth/me');
          localStorage.setItem(KEY, JSON.stringify(fresh));
          setUser(fresh);
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) leave();
        }
      } else setReady(true);
    })();
  }, [enter, leave]);

  // sessão expirou durante a sincronização
  useEffect(() => {
    if (sync.authExpired && user) leave();
  }, [sync.authExpired, user, leave]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { user: u } = await api<{ user: SessionUser }>('/auth/login', { body: { email, password } });
      await enter(u);
    },
    [enter],
  );
  const setupAdmin = useCallback(
    async (name: string, email: string, password: string) => {
      const { user: u } = await api<{ user: SessionUser }>('/auth/setup', { body: { name, email, password } });
      await enter(u);
    },
    [enter],
  );
  const register = useCallback(
    async (name: string, email: string, password: string, code: string) => {
      const { user: u } = await api<{ user: SessionUser }>('/auth/register', { body: { name, email, password, code } });
      await enter(u);
    },
    [enter],
  );
  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {
      /* offline: encerra localmente */
    }
    leave();
  }, [leave]);
  const refresh = useCallback(async () => {
    const { user: fresh } = await api<{ user: SessionUser }>('/auth/me');
    localStorage.setItem(KEY, JSON.stringify(fresh));
    setUser(fresh);
  }, []);

  return (
    <Ctx.Provider value={{ user, ready, login, setupAdmin, register, logout, refresh, can: (m, a = 'view') => can(user, m, a) }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider ausente');
  return c;
}

export function useSyncState() {
  return useSyncExternalStore(syncStore.subscribe, syncStore.get);
}
