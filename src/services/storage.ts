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

interface DesktopStorageBridge {
  readState(key: string): Promise<{ found: boolean; value?: unknown }>;
  writeState(key: string, value: unknown): Promise<true>;
  clearAll(): Promise<true>;
  listQueue(): Promise<SyncQueueItem[]>;
  upsertQueue(item: SyncQueueItem): Promise<true>;
  deleteQueue(id: string): Promise<true>;
  getMeta(key: string): Promise<{ found: boolean; value?: unknown }>;
  setMeta(key: string, value: unknown): Promise<true>;
}

declare global {
  interface Window {
    jnStorage?: DesktopStorageBridge;
  }
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
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? request.error ?? new Error("Falha ao gravar no IndexedDB"));
    tx.onabort = () => reject(tx.error ?? request.error ?? new Error("Gravação cancelada no IndexedDB"));
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

function isEmptyContainer(value: unknown): boolean {
  return (Array.isArray(value) && value.length === 0)
    || (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
}

function isNonEmptyContainer(value: unknown): boolean {
  return (Array.isArray(value) && value.length > 0)
    || (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0);
}

async function readLegacyStorageAsync<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await idbGet<T>(STORE, key);
    if (value !== undefined) {
      // A previous build could leave valid data in localStorage while the
      // IndexedDB key exists but contains an empty collection. Restore the
      // fuller backup before refreshing it, so startup never erases it.
      const backup = fallbackRead<T | undefined>(key, undefined);
      if (isEmptyContainer(value) && backup !== undefined && isNonEmptyContainer(backup)) {
        await idbPut(STORE, backup, key);
        fallbackWrite(key, backup);
        return backup;
      }
      // Rebuild the local backup from installations that only wrote to IndexedDB.
      fallbackWrite(key, value);
      return value;
    }
    const legacy = fallbackRead<T>(key, fallback);
    await idbPut(STORE, legacy, key);
    fallbackWrite(key, legacy);
    return legacy;
  } catch {
    return fallbackRead(key, fallback);
  }
}

export async function readStorageAsync<T>(key: string, fallback: T): Promise<T> {
  const desktopStorage = typeof window !== "undefined" ? window.jnStorage : undefined;
  if (!desktopStorage) return readLegacyStorageAsync(key, fallback);

  const durable = await desktopStorage.readState(key);
  if (durable.found) {
    const value = durable.value as T;
    // Protect records left by an older build if a first SQLite row was empty.
    const backup = fallbackRead<T | undefined>(key, undefined);
    if (isEmptyContainer(value) && backup !== undefined && isNonEmptyContainer(backup)) {
      await desktopStorage.writeState(key, backup);
      fallbackWrite(key, backup);
      try { await idbPut(STORE, backup, key); } catch { /* SQLite is the durable copy */ }
      return backup;
    }
    fallbackWrite(key, value);
    return value;
  }

  // Import from the old IndexedDB/localStorage profile once per key. The old
  // profile is left intact as a recovery copy until SQLite has accepted it.
  const migrated = await readLegacyStorageAsync(key, fallback);
  await desktopStorage.writeState(key, migrated);
  return migrated;
}

export function readStorage<T>(key: string, fallback: T): T {
  // Mantido para compatibilidade com configurações e código legado.
  return fallbackRead(key, fallback);
}

export async function writeStorageAsync<T>(key: string, value: T) {
  const desktopStorage = typeof window !== "undefined" ? window.jnStorage : undefined;
  if (desktopStorage) {
    // Await the SQLite commit before telling the UI a save succeeded.
    await desktopStorage.writeState(key, value);
    fallbackWrite(key, value);
    try { await idbPut(STORE, value, key); } catch { /* SQLite remains authoritative */ }
    return;
  }
  try {
    await idbPut(STORE, value, key);
  } catch {
    // The synchronous local copy keeps data recoverable if IndexedDB is reset.
    fallbackWrite(key, value);
    return;
  }
  // Always mirror successful IndexedDB writes, not only failures.
  fallbackWrite(key, value);
}

export function writeStorage<T>(key: string, value: T) {
  fallbackWrite(key, value);
  const desktopStorage = typeof window !== "undefined" ? window.jnStorage : undefined;
  if (desktopStorage) {
    void desktopStorage.writeState(key, value).catch(() => undefined);
  }
  void idbPut(STORE, value, key).catch(() => undefined);
}

export async function clearAllStorage() {
  const desktopStorage = typeof window !== "undefined" ? window.jnStorage : undefined;
  if (desktopStorage) await desktopStorage.clearAll();
  try { await idbClear(STORE); } catch { /* SQLite is authoritative on desktop */ }
  try { await idbClear(QUEUE_STORE); } catch { /* ignore */ }
  try { await idbClear(META_STORE); } catch { /* ignore */ }
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

function writeQueueBackup(queue: SyncQueueItem[]) {
  fallbackWrite(QUEUE_STORE, queue);
}

async function deleteQueuedItem(id: string) {
  const queue = await getSyncQueue();
  const desktopStorage = typeof window !== "undefined" ? window.jnStorage : undefined;
  if (desktopStorage) await desktopStorage.deleteQueue(id);
  writeQueueBackup(queue.filter((item) => item.id !== id));
  try { await idbDelete(QUEUE_STORE, id); } catch { /* local backup remains authoritative */ }
}

async function updateQueuedItem(item: SyncQueueItem) {
  const queue = await getSyncQueue();
  const next = queue.some((queued) => queued.id === item.id)
    ? queue.map((queued) => queued.id === item.id ? item : queued)
    : [...queue, item];
  const desktopStorage = typeof window !== "undefined" ? window.jnStorage : undefined;
  if (desktopStorage) await desktopStorage.upsertQueue(item);
  writeQueueBackup(next);
  try { await idbPut(QUEUE_STORE, item); } catch { /* local backup remains authoritative */ }
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
  const existing = await getSyncQueue();
  const desktopStorage = typeof window !== "undefined" ? window.jnStorage : undefined;
  if (desktopStorage) await desktopStorage.upsertQueue(item);
  writeQueueBackup([...existing.filter((queued) => queued.id !== item.id), item]);
  try { await idbPut(QUEUE_STORE, item); } catch { /* offline storage backup remains available */ }
  void syncPending();
}

export async function queueStorageSync(resource: string, recordId: string, payload: unknown) {
  await enqueue(resource, "update", recordId, payload);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const desktopStorage = typeof window !== "undefined" ? window.jnStorage : undefined;
  if (desktopStorage) {
    const migrated = await desktopStorage.getMeta("sync_queue_migrated");
    const stored = await desktopStorage.listQueue();
    if (migrated.found && migrated.value === true) {
      writeQueueBackup(stored);
      return stored;
    }

    // Merge the durable queue with both older stores before marking migration
    // complete, so an interrupted earlier sync does not drop pending records.
    const backup = fallbackRead<SyncQueueItem[]>(QUEUE_STORE, []);
    let indexedDbQueue: SyncQueueItem[] = [];
    try { indexedDbQueue = await idbAll<SyncQueueItem>(QUEUE_STORE); } catch { /* local backup remains available */ }
    const byId = new Map<string, SyncQueueItem>();
    for (const item of [...backup, ...indexedDbQueue, ...stored]) {
      if (item && typeof item.id === "string") byId.set(item.id, item);
    }
    const queue = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const item of queue) await desktopStorage.upsertQueue(item);
    await desktopStorage.setMeta("sync_queue_migrated", true);
    writeQueueBackup(queue);
    for (const item of queue) {
      try { await idbPut(QUEUE_STORE, item); } catch { /* SQLite is authoritative */ }
    }
    return queue;
  }

  const backup = fallbackRead<SyncQueueItem[]>(QUEUE_STORE, []);
  try {
    const stored = await idbAll<SyncQueueItem>(QUEUE_STORE);
    const byId = new Map<string, SyncQueueItem>();
    for (const item of [...backup, ...stored]) byId.set(item.id, item);
    const queue = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    writeQueueBackup(queue);
    for (const item of queue) {
      if (!stored.some((saved) => saved.id === item.id)) {
        try { await idbPut(QUEUE_STORE, item); } catch { /* queue remains in local backup */ }
      }
    }
    return queue;
  } catch {
    return backup.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export async function getPendingSyncCount() {
  return (await getSyncQueue()).length;
}

export async function getLastSyncAt() {
  const desktopStorage = typeof window !== "undefined" ? window.jnStorage : undefined;
  if (desktopStorage) {
    const stored = await desktopStorage.getMeta("lastSyncAt");
    if (stored.found) return stored.value as string;
    const legacy = (await idbGet<string>(META_STORE, "lastSyncAt")) ?? null;
    if (legacy) await desktopStorage.setMeta("lastSyncAt", legacy);
    return legacy;
  }
  return (await idbGet<string>(META_STORE, "lastSyncAt")) ?? null;
}

async function setLastSyncAt(value: string) {
  const desktopStorage = typeof window !== "undefined" ? window.jnStorage : undefined;
  if (desktopStorage) await desktopStorage.setMeta("lastSyncAt", value);
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

async function syncBatch(items: SyncQueueItem[]): Promise<{ processed: string[]; failed: string[] } | null> {
  const response = await fetch(`${API_URL}/sync/records/batch`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ items }),
  });
  // Support an older server while a backend update is rolling out.
  if (!response.headers.get("content-type")?.includes("application/json")) return null;
  // A malformed item in an old queue must not block all other records in its batch.
  if (response.status === 400) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json() as { processed?: string[]; failed?: Array<{ id?: string }> };
  return {
    processed: Array.isArray(result.processed) ? result.processed : [],
    failed: Array.isArray(result.failed) ? result.failed.map((entry) => String(entry.id || "")) : [],
  };
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
      for (let offset = 0; offset < queue.length; offset += 50) {
        const batch = queue.slice(offset, offset + 50);
        try {
          const result = await syncBatch(batch);
          if (result) {
            const processed = new Set(result.processed);
            const failed = new Set(result.failed);
            for (const item of batch) {
              if (processed.has(item.id)) {
                await deleteQueuedItem(item.id);
                synced += 1;
              } else if (failed.has(item.id)) {
                await updateQueuedItem({ ...item, attempts: item.attempts + 1, lastError: "Falha ao sincronizar registro" });
              }
            }
            continue;
          }
          // Compatibility path for servers without the batch endpoint.
          for (const item of batch) {
            try {
              if (await syncItem(item)) {
                await deleteQueuedItem(item.id);
                synced += 1;
              }
            } catch (error) {
              await updateQueuedItem({ ...item, attempts: item.attempts + 1, lastError: error instanceof Error ? error.message : "Falha de sincronização" });
            }
          }
        } catch (error) {
          for (const item of batch) {
            await updateQueuedItem({ ...item, attempts: item.attempts + 1, lastError: error instanceof Error ? error.message : "Falha de sincronização" });
          }
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
    const storageKey = resource === "workOrders" ? "work_orders" : resource;
    await writeStorageAsync(storageKey, result[resource]);
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
  try {
    const response = await fetch(`${API_URL}/auth/me`, { headers: authHeaders(), cache: "no-store" });
    // A 401 still confirms that the API is reachable when no session is present.
    return response.ok || response.status === 401;
  } catch { return false; }
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
  const syncResource = key === "work_orders" ? "workOrders" : key;

  return {
    async list() { await delay(); return load(); },
    async get(id) { await delay(20); return (await load()).find((i) => i.id === id); },
    async create(item) {
      const items = await load();
      items.unshift(item);
      await save(items);
      await enqueue(syncResource, "create", item.id, item);
      return item;
    },
    async update(id, patch) {
      const items = await load();
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) throw new Error("Registro não encontrado");
      items[idx] = { ...items[idx], ...patch };
      await save(items);
      await enqueue(syncResource, "update", id, patch);
      return items[idx];
    },
    async remove(id) {
      await save((await load()).filter((i) => i.id !== id));
      await enqueue(syncResource, "remove", id);
    },
    async replaceAll(items) {
      await save(items);
      await enqueue(syncResource, "replaceAll", undefined, items);
      return items;
    },
  };
}

