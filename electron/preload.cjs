const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("jnStorage", Object.freeze({
  readState: invoke("jn-storage:read-state"),
  writeState: invoke("jn-storage:write-state"),
  clearAll: invoke("jn-storage:clear-all"),
  listQueue: invoke("jn-storage:list-queue"),
  upsertQueue: invoke("jn-storage:upsert-queue"),
  deleteQueue: invoke("jn-storage:delete-queue"),
  getMeta: invoke("jn-storage:get-meta"),
  setMeta: invoke("jn-storage:set-meta"),
}));
