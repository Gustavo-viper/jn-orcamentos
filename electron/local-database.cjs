const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const KEY_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

function assertKey(value, label) {
  if (typeof value !== "string" || !KEY_PATTERN.test(value)) {
    throw new TypeError(`${label} inválida`);
  }
  return value;
}

function serialize(value) {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("Valor não pode ser convertido para JSON");
  return json;
}

function createLocalDatabase(userDataPath) {
  const directory = path.join(userDataPath, "jn-gesso-data");
  fs.mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, "jn-gesso.sqlite"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY NOT NULL,
      item_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const readStateStatement = db.prepare("SELECT value_json FROM app_state WHERE key = ?");
  const writeStateStatement = db.prepare(`
    INSERT INTO app_state (key, value_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `);
  const getMetaStatement = db.prepare("SELECT value_json FROM app_meta WHERE key = ?");
  const setMetaStatement = db.prepare(`
    INSERT INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `);
  const upsertQueueStatement = db.prepare(`
    INSERT INTO sync_queue (id, item_json, created_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET item_json = excluded.item_json, created_at = excluded.created_at
  `);
  let closed = false;

  function ensureOpen() {
    if (closed) throw new Error("Banco local já foi fechado");
  }

  function transaction(action) {
    ensureOpen();
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* mantém o erro original */ }
      throw error;
    }
  }

  return {
    readState(key) {
      ensureOpen();
      const row = readStateStatement.get(assertKey(key, "Chave"));
      return row ? { found: true, value: JSON.parse(row.value_json) } : { found: false };
    },
    writeState(key, value) {
      const safeKey = assertKey(key, "Chave");
      const json = serialize(value);
      transaction(() => writeStateStatement.run(safeKey, json, new Date().toISOString()));
      return true;
    },
    clearAll() {
      transaction(() => {
        db.exec("DELETE FROM app_state; DELETE FROM sync_queue; DELETE FROM app_meta;");
      });
      return true;
    },
    listQueue() {
      ensureOpen();
      return db.prepare("SELECT item_json FROM sync_queue ORDER BY created_at ASC, id ASC")
        .all().map((row) => JSON.parse(row.item_json));
    },
    upsertQueue(item) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("Item da fila inválido");
      const id = assertKey(item.id, "ID da fila");
      const createdAt = typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString();
      const json = serialize(item);
      transaction(() => upsertQueueStatement.run(id, json, createdAt));
      return true;
    },
    deleteQueue(id) {
      transaction(() => db.prepare("DELETE FROM sync_queue WHERE id = ?").run(assertKey(id, "ID da fila")));
      return true;
    },
    getMeta(key) {
      ensureOpen();
      const row = getMetaStatement.get(assertKey(key, "Chave de metadados"));
      return row ? { found: true, value: JSON.parse(row.value_json) } : { found: false };
    },
    setMeta(key, value) {
      const safeKey = assertKey(key, "Chave de metadados");
      const json = serialize(value);
      transaction(() => setMetaStatement.run(safeKey, json, new Date().toISOString()));
      return true;
    },
    close() {
      if (closed) return;
      try { db.exec("PRAGMA wal_checkpoint(TRUNCATE);"); } finally {
        db.close();
        closed = true;
      }
    },
  };
}

module.exports = { createLocalDatabase };
