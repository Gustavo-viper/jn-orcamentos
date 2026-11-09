/**
 * J&N Orçamentos — aplicativo para Windows.
 * Abre o sistema publicado numa janela própria. Os dados e a fila offline ficam
 * no perfil persistente do app (IndexedDB + service worker), como no navegador.
 */
const { app, BrowserWindow, shell, Menu, session } = require('electron');
const path = require('node:path');

const APP_URL = process.env.JN_APP_URL || 'https://jn-orcamentos.up.railway.app';
const ORIGIN = new URL(APP_URL).origin;

// uma única janela do app
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function offlinePage() {
  const html = `<!doctype html><meta charset="utf-8"><title>J&N Orçamentos</title>
  <body style="margin:0;height:100vh;display:grid;place-items:center;background:#0a1630;color:#e9d3a1;font-family:Segoe UI,sans-serif;text-align:center">
  <div><h2 style="margin:0 0 8px">Sem conexão no primeiro acesso</h2>
  <p style="color:#aebddc;max-width:420px">Conecte-se à internet uma vez para carregar o J&N Orçamentos.<br>Depois disso ele funciona também offline.</p>
  <button onclick="location.href='${APP_URL}'" style="margin-top:12px;padding:10px 18px;border:0;border-radius:12px;background:#cfa75a;color:#0a1630;font-weight:600;cursor:pointer">Tentar novamente</button></div></body>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: 'J&N Orçamentos',
    backgroundColor: '#0a1630',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      partition: 'persist:jn-orcamentos',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  win.once('ready-to-show', () => win.show());

  // links externos (WhatsApp, e-mail, CEP...) abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN) && !url.includes('/portal/')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN) && !url.startsWith('data:')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    // sem internet e sem cache do service worker: mostra aviso amigável
    if (isMain && code !== -3 && url.startsWith(ORIGIN)) win.loadURL(offlinePage());
  });

  win.loadURL(APP_URL);
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // permite downloads (PDF, Excel, CSV) com a caixa "Salvar como" do Windows
  session.fromPartition('persist:jn-orcamentos').on('will-download', () => undefined);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
