const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs");
const path = require("node:path");
const { createLocalDatabase } = require("./local-database.cjs");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "jn-app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

const DIST_DIR = path.resolve(__dirname, "..", "dist");
const STORAGE_CHANNELS = {
  readState: "jn-storage:read-state",
  writeState: "jn-storage:write-state",
  clearAll: "jn-storage:clear-all",
  listQueue: "jn-storage:list-queue",
  upsertQueue: "jn-storage:upsert-queue",
  deleteQueue: "jn-storage:delete-queue",
  getMeta: "jn-storage:get-meta",
  setMeta: "jn-storage:set-meta",
};
let localDatabase;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveAppFile(request) {
  try {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const relativePath = pathname.replace(/^\/+/, "") || "index.html";
    const filePath = path.resolve(DIST_DIR, relativePath);
    if (filePath !== path.join(DIST_DIR, "index.html") && !filePath.startsWith(`${DIST_DIR}${path.sep}`)) {
      return new Response("Not found", { status: 404 });
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(fs.readFileSync(filePath), {
      headers: {
        "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 920,
    minHeight: 640,
    show: false,
    title: "J&N Orçamentos",
    backgroundColor: "#211e1b",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("jn-app://desktop/")) return { action: "allow" };
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("jn-app://desktop/")) {
      event.preventDefault();
      if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    }
  });

  void window.loadURL("jn-app://desktop/");
}

function registerStorageIpc() {
  localDatabase = createLocalDatabase(app.getPath("userData"));
  const handlers = {
    [STORAGE_CHANNELS.readState]: (_event, key) => localDatabase.readState(key),
    [STORAGE_CHANNELS.writeState]: (_event, key, value) => localDatabase.writeState(key, value),
    [STORAGE_CHANNELS.clearAll]: () => localDatabase.clearAll(),
    [STORAGE_CHANNELS.listQueue]: () => localDatabase.listQueue(),
    [STORAGE_CHANNELS.upsertQueue]: (_event, item) => localDatabase.upsertQueue(item),
    [STORAGE_CHANNELS.deleteQueue]: (_event, id) => localDatabase.deleteQueue(id),
    [STORAGE_CHANNELS.getMeta]: (_event, key) => localDatabase.getMeta(key),
    [STORAGE_CHANNELS.setMeta]: (_event, key, value) => localDatabase.setMeta(key, value),
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args) => {
      const url = event.senderFrame?.url || "";
      const isApp = url.startsWith("jn-app://desktop/");
      const isDev = !app.isPackaged && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
      if (!isApp && !isDev) throw new Error("Origem não autorizada para o armazenamento local");
      return handler(event, ...args);
    });
  }
}

function configureAutoUpdates() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (error) => console.warn("Falha ao verificar atualização:", error.message));
  autoUpdater.on("update-downloaded", async (info) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Atualização pronta",
      message: `A versão ${info.version} foi baixada.`,
      detail: "Reinicie o J&N Orçamentos para instalar a atualização.",
      buttons: ["Reiniciar agora", "Depois"],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0) autoUpdater.quitAndInstall();
  });

  const checkForUpdates = () => {
    void autoUpdater.checkForUpdates().catch((error) => console.warn("Falha ao verificar atualização:", error.message));
  };
  setTimeout(checkForUpdates, 12_000);
  setInterval(checkForUpdates, 4 * 60 * 60 * 1000);
}

const hasSingleInstance = app.requestSingleInstanceLock();
if (!hasSingleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  app.whenReady().then(() => {
    registerStorageIpc();
    protocol.handle("jn-app", serveAppFile);
    createWindow();
    configureAutoUpdates();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", () => {
    try { localDatabase?.close(); } catch (error) { console.error("Falha ao fechar o banco local:", error); }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
