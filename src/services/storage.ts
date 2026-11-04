// Persistência offline-first do J&N.
// Os dados principais ficam no IndexedDB para suportar uso sem internet.
// As mutações também entram em uma fila de sincronização. Quando uma API
// estiver configurada em VITE_API_URL, a fila tenta sincronizar automaticamente.

const DB_NAME = "jn-gesso-offline";
const DB_VERSION = 1;
const STORE = "repositories";
const QUEUE_STORE = "sync_queue";
const META_STORE = "meta";
const PREFIX = "jn-gesso:";
const LATENCY = 40;
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";
const TOKEN_KEY = "jn-gesso:cloud-token-v1";

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export type SyncOperation = "create" | "update" | "remove" | "replaceAll";
export interface SyncQueueItem {
  id: string;
  resource: string;
  operation: SyncOperation;
  recordId?: string;
  payload?: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let syncInProgress = false;
let syncRequested = false;

export const delay = (ms = LATENCY) => new Promise((r) => setTimeout(r, ms));

function supportsIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!supportsIndexedDb()) return Promise.reject(new Error("IndexedDB indisponível"));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir IndexedDB"));
  });
  return dbPromise;
}

async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(storeName: string, value: unknown, key?: IDBValidKey) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const request = key === undefined ? tx.objectStore(storeName).put(value) : tx.objectStore(storeName).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function idbDelete(storeName: string, key: IDBValidKey) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const request = tx.objectStore(storeName).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function idbClear(storeName: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const request = tx.objectStore(storeName).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function idbAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve((request.result ?? []) as T[]);
    request.onerror = () => reject(request.error);
  });
}

function fallbackRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function fallbackWrite<T>(key: string, value: T) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
}

export async function readStorageAsync<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await idbGet<T>(STORE, key);
    if (value !== undefined) return value;
    const legacy = fallbackRead<T>(key, fallback);
    await idbPut(STORE, legacy, key);
    return legacy;
  } catch {
    return fallbackRead(key, fallback);
  }
}

export function readStorage<T>(key: string, fallback: T): T {
  // Mantido para compatibilidade com configurações e código legado.
  return fallbackRead(key, fallback);
}

export async function writeStorageAsync<T>(key: string, value: T) {
  try {
    await idbPut(STORE, value, key);
  } catch {
    fallbackWrite(key, value);
  }
}

export function writeStorage<T>(key: string, value: T) {
  fallbackWrite(key, value);
  void idbPut(STORE, value, key).catch(() => undefined);
}

export async function clearAllStorage() {
  try { await idbClear(STORE); } catch { /* fallback below */ }
  try { await idbClear(QUEUE_STORE); } catch { /* ignore */ }
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

async function enqueue(resource: string, operation: SyncOperation, recordId?: string, payload?: unknown) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const item: SyncQueueItem = {
    id,
    resource,
    operation,
    recordId,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  try { await idbPut(QUEUE_STORE, item); } catch { /* offline storage failure */ }
  void syncPending();
}

export async function queueStorageSync(resource: string, recordId: string, payload: unknown) {
  await enqueue(resource, "update", recordId, payload);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  try { return await idbAll<SyncQueueItem>(QUEUE_STORE); } catch { return []; }
}

export async function getPendingSyncCount() {
  return (await getSyncQueue()).length;
}

export async function getLastSyncAt() {
  return (await idbGet<string>(META_STORE, "lastSyncAt")) ?? null;
}

async function setLastSyncAt(value: string) {
  await idbPut(META_STORE, value, "lastSyncAt");
}

async function syncItem(item: SyncQueueItem) {
  if (!API_URL) return false;
  if (!localStorage.getItem(TOKEN_KEY)) return false;
  const response = await fetch(`${API_URL}/sync/records`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(item),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return true;
}

export async function syncPending() {
  if (!API_URL || !localStorage.getItem(TOKEN_KEY) || typeof navigator === "undefined") return;
  if (syncInProgress) {
    syncRequested = true;
    return;
  }
  syncInProgress = true;
  try {
    let synced = 0;
    do {
      syncRequested = false;
      const queue = await getSyncQueue();
      for (const item of queue) {
        try {
          const ok = await syncItem(item);
          if (ok) {
            await idbDelete(QUEUE_STORE, item.id);
            synced += 1;
          }
        } catch (error) {
          await idbPut(QUEUE_STORE, {
            ...item,
            attempts: item.attempts + 1,
            lastError: error instanceof Error ? error.message : "Falha de sincronização",
          });
          // Não bloqueia os demais itens.
        }
      }
    } while (syncRequested);
    if (synced) await setLastSyncAt(new Date().toISOString());
  } finally {
    syncInProgress = false;
  }
}

export async function pullSharedState<T extends Record<string, unknown>>(local: T): Promise<T> {
  if (!API_URL || !localStorage.getItem(TOKEN_KEY) || typeof navigator === "undefined") return local;
  await syncPending();
  const response = await fetch(`${API_URL}/sync/state`, { headers: authHeaders() });
  if (!response.ok) throw new Error(`Falha ao buscar dados compartilhados (HTTP ${response.status})`);
  const cloud = await response.json() as Record<string, Array<{ id: string; data: unknown }> | undefined>;
  const queue = await getSyncQueue();
  const pendingByResource = new Map<string, Set<string>>();
  for (const item of queue) {
    if (!item.recordId) continue;
    const ids = pendingByResource.get(item.resource) ?? new Set<string>();
    ids.add(item.recordId);
    pendingByResource.set(item.resource, ids);
  }
  const result: Record<string, unknown> = { ...local };
  for (const [resource, rows] of Object.entries(cloud)) {
    if (!Array.isArray(rows)) continue;
    const pending = pendingByResource.get(resource) ?? new Set<string>();
    const remoteItems = rows.map((row) => row.data as { id: string });
    const localItems = (local[resource] as { id: string }[] | undefined) ?? [];
    const localById = new Map(localItems.map((item) => [item.id, item]));
    const remoteById = new Map(remoteItems.map((item) => [item.id, item]));
    for (const id of pending) {
      const localItem = localById.get(id);
      if (localItem) remoteById.set(id, localItem);
      else remoteById.delete(id);
    }
    result[resource] = [...remoteById.values()];
    await writeStorageAsync(resource, result[resource]);
  }
  if (cloud.settings?.[0]?.data && !pendingByResource.has("settings")) {
    result.settings = cloud.settings[0].data;
    await writeStorageAsync("settings", result.settings);
  }
  return result as T;
}

export async function pushInitialSharedState(state: Record<string, unknown>) {
  if (!API_URL || !localStorage.getItem(TOKEN_KEY)) return;
  const records: { resource: string; id: string; data: unknown }[] = [];
  for (const [resource, value] of Object.entries(state)) {
    if (Array.isArray(value)) {
      for (const record of value as { id: string }[]) {
        records.push({ resource, id: record.id, data: record });
      }
    } else if (resource === "settings" && value && typeof value === "object") {
      records.push({ resource, id: "company", data: value });
    }
  }
  const response = await fetch(`${API_URL}/sync/bootstrap`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ records }) });
  if (!response.ok) throw new Error(`Falha ao enviar os dados iniciais (HTTP ${response.status})`);
}

export async function hasSharedState() {
  if (!API_URL || !localStorage.getItem(TOKEN_KEY)) return false;
  const response = await fetch(`${API_URL}/sync/state`, { headers: authHeaders() });
  if (!response.ok) throw new Error("Não foi possível verificar os dados compartilhados.");
  const state = await response.json() as Record<string, unknown[]>;
  return Object.values(state).some((rows) => Array.isArray(rows) && rows.length > 0);
}

export async function checkApiConnection() {
  if (!API_URL || typeof navigator === "undefined") return false;
  try { const response = await fetch(`${API_URL}/health`, { cache: "no-store" }); return response.ok; } catch { return false; }
}

export function startSyncEngine() {
  if (typeof window === "undefined") return () => undefined;
  const sync = () => {
    if (document.visibilityState === "visible") void syncPending();
  };
  window.addEventListener("online", sync);
  const timer = window.setInterval(sync, 5_000);
  sync();
  return () => {
    window.removeEventListener("online", sync);
    window.clearInterval(timer);
  };
}

export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  create(item: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
  replaceAll(items: T[]): Promise<T[]>;
}

export function createRepository<T extends { id: string }>(key: string, seed: T[]): Repository<T> {
  const load = () => readStorageAsync<T[]>(key, seed);
  const save = (items: T[]) => writeStorageAsync(key, items);

  return {
    async list() { await delay(); return load(); },
    async get(id) { await delay(20); return (await load()).find((i) => i.id === id); },
    async create(item) {
      const items = await load();
      items.unshift(item);
      await save(items);
      await enqueue(key, "create", item.id, item);
      return item;
    },
    async update(id, patch) {
      const items = await load();
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) throw new Error("Registro não encontrado");
      items[idx] = { ...items[idx], ...patch };
      await save(items);
      await enqueue(key, "update", id, patch);
      return items[idx];
    },
    async remove(id) {
      await save((await load()).filter((i) => i.id !== id));
      await enqueue(key, "remove", id);
    },
    async replaceAll(items) {
      await save(items);
      await enqueue(key, "replaceAll", undefined, items);
      return items;
    },
  };
}

