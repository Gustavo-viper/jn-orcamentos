/**
 * Motor de sincronização do cliente.
 *
 *  1. Toda alteração é gravada primeiro no IndexedDB e numa fila persistente (outbox).
 *  2. Quando há conexão, a fila é enviada em ordem (push). Cada operação tem opId único:
 *     reenvios após queda de conexão nunca duplicam dados no servidor.
 *  3. Em seguida recebe somente o que mudou desde o último cursor (pull) e MESCLA
 *     registro a registro. Nada é apagado localmente por "não ter vindo" na resposta.
 *  4. Registros com alterações locais ainda pendentes não são sobrescritos pelo servidor.
 */
import { SYNC_TABLES, type PullResponse, type SyncOpResult, type SyncTable } from '@jn/shared';
import { api, ApiError, NetworkError, errorMessage } from './api';
import { getDb, getMeta, setMeta } from './db';

export interface SyncState {
  online: boolean;
  syncing: boolean;
  lastSync: string | null;
  lastError: string | null;
  authExpired: boolean;
  initialized: boolean;
}

let state: SyncState = { online: navigator.onLine, syncing: false, lastSync: null, lastError: null, authExpired: false, initialized: false };
const listeners = new Set<() => void>();
function set(p: Partial<SyncState>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export const syncStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,
};

const VALID_TABLES = new Set<string>(SYNC_TABLES);

async function pendingTargets(): Promise<Set<string>> {
  const entries = await getDb().outbox.where('status').equals('pending').toArray();
  return new Set(entries.flatMap((e) => e.targets));
}

/** Aplica registros vindos do servidor, com validação e sem sobrescrever pendências locais. */
export async function applyServerRecords(items: { table: SyncTable; record: Record<string, unknown> }[], skip?: Set<string>) {
  if (!items.length) return;
  const db = getDb();
  const pending = skip ?? (await pendingTargets());
  const byTable = new Map<SyncTable, Record<string, unknown>[]>();
  for (const it of items) {
    if (!VALID_TABLES.has(it.table)) continue;
    const r = it.record;
    // descarta respostas malformadas — dados vazios nunca substituem dados completos
    if (!r || typeof r.id !== 'string' || typeof r.version !== 'number') continue;
    if (pending.has(r.id)) continue;
    byTable.set(it.table, [...(byTable.get(it.table) ?? []), r]);
  }
  for (const [table, rows] of byTable) {
    const t = db.table(table);
    await db.transaction('rw', t, async () => {
      const existing = await t.bulkGet(rows.map((r) => r.id as string));
      const toPut = rows
        .filter((r, i) => {
          const cur = existing[i] as { version?: number; seq?: number } | undefined;
          // nunca regride para uma versão mais antiga
          return !cur || cur.version === undefined || (r.version as number) >= cur.version || (r.seq as number) >= (cur.seq ?? 0);
        })
        .map((r) => ({ ...r, _syncError: null }));
      if (toPut.length) await t.bulkPut(toPut);
    });
  }
}

let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let backoff = 0;

async function push(): Promise<void> {
  const db = getDb();
  for (;;) {
    const batch = await db.outbox.where('status').equals('pending').sortBy('seq');
    if (!batch.length) return;
    const slice = batch.slice(0, 50);
    const { results } = await api<{ results: SyncOpResult[] }>('/sync/push', { method: 'POST', body: { ops: slice.map((e) => e.op) }, timeoutMs: 60_000 });
    for (const res of results) {
      const entry = slice.find((e) => e.opId === res.opId);
      if (!entry) continue;
      if (res.ok) {
        await db.outbox.delete(entry.seq!);
      } else {
        await db.outbox.update(entry.seq!, { status: 'error', error: res.error ?? 'Operação rejeitada', attempts: entry.attempts + 1 });
        // registro criado localmente e rejeitado: mantém os dados e sinaliza o erro
        const op = entry.op;
        if (op.type === 'upsert' && !res.records?.some((r) => r.record.id === op.id)) {
          await db.table(op.table).update(op.id, { _syncError: res.error ?? 'Não sincronizado' });
        }
      }
      const others = await pendingTargets();
      await applyServerRecords(res.records ?? [], others);
    }
    if (results.length < slice.length) return;
  }
}

async function pull(): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const cursor = await getMeta<number>('cursor', 0);
    const r = await api<PullResponse>(`/sync/pull?cursor=${cursor}&limit=500`, { timeoutMs: 60_000 });
    if (!Array.isArray(r.changes) || typeof r.cursor !== 'number') throw new Error('Resposta de sincronização inválida.');
    await applyServerRecords(r.changes);
    if (r.cursor > cursor) await setMeta('cursor', r.cursor);
    if (!r.hasMore) break;
  }
}

async function cycle() {
  set({ syncing: true });
  try {
    await push();
    await pull();
    const now = new Date().toISOString();
    await setMeta('lastSync', now);
    backoff = 0;
    set({ online: true, lastSync: now, lastError: null, authExpired: false, initialized: true });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) set({ authExpired: true, lastError: e.message });
    else if (e instanceof NetworkError) {
      set({ online: false, lastError: null });
      backoff = Math.min(60_000, backoff ? backoff * 2 : 3000);
      schedule(backoff);
    } else {
      set({ lastError: errorMessage(e) });
      console.error('[sync]', e);
      backoff = Math.min(60_000, backoff ? backoff * 2 : 5000);
      schedule(backoff);
    }
  } finally {
    set({ syncing: false });
  }
}

/** Executa um ciclo de sincronização (agrupa chamadas simultâneas). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await cycle();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

export function schedule(ms = 400) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, ms);
}

let es: EventSource | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
const onOnline = () => {
  set({ online: true });
  schedule(100);
};
const onOffline = () => set({ online: false });
const onVisible = () => document.visibilityState === 'visible' && schedule(200);

export async function startSync() {
  stopSync();
  set({ lastSync: await getMeta<string | null>('lastSync', null), initialized: !!(await getMeta<string | null>('lastSync', null)), authExpired: false });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  interval = setInterval(() => void syncNow(), 30_000);
  try {
    es = new EventSource('/api/events');
    es.addEventListener('change', () => schedule(250));
    es.addEventListener('hello', () => set({ online: true }));
  } catch {
    /* SSE indisponível: o intervalo cobre */
  }
  void syncNow();
}

export function stopSync() {
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', onVisible);
  if (interval) clearInterval(interval);
  if (timer) clearTimeout(timer);
  es?.close();
  es = null;
  interval = null;
}
