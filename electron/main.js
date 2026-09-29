const { app, BrowserWindow, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { resolveStaticFile, mimeFor } = require('./static-files');

/*
 * The Next.js static export references assets by absolute path (/_next/...),
 * which resolve to the filesystem root under file://. Serving the export from
 * a privileged custom scheme gives it a proper origin: assets load, and the
 * page is a secure context (WebCrypto, camera) with its own localStorage.
 */
const SCHEME = 'app';
const HOST = 'bolt';
const APP_ORIGIN = `${SCHEME}://${HOST}`;
const OUT_DIR = path.join(__dirname, '..', 'out');

// `electron .` during development loads the Next dev server; pass
// --serve-static (or package the app) to load the exported build instead.
const useDevServer = !app.isPackaged && !process.argv.includes('--serve-static');
const DEV_URL = process.env.ELECTRON_START_URL || 'http://localhost:3000';
const APP_URL = useDevServer ? DEV_URL : `${APP_ORIGIN}/`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

const isAppUrl = (url) => {
  try {
    return new URL(url).origin === new URL(APP_URL).origin;
  } catch {
    return false;
  }
};

/** Only hand plain web links to the OS browser. */
const openExternally = (url) => {
  try {
    const { protocol: scheme } = new URL(url);
    if (scheme === 'https:' || scheme === 'http:') shell.openExternal(url);
  } catch {
    /* ignore malformed URLs */
  }
};

function registerStaticProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const file = resolveStaticFile(OUT_DIR, request.url);
    const target = file || resolveStaticFile(OUT_DIR, `${APP_ORIGIN}/404.html`);
    if (!target) return new Response('Not found', { status: 404 });
    const body = await fs.promises.readFile(target);
    return new Response(body, {
      status: file ? 200 : 404,
      headers: { 'content-type': mimeFor(target) },
    });
  });
}

function configurePermissions() {
  // The app needs the camera (hand tracking, QR scanning) and clipboard; nothing else.
  const allowed = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
  const trusted = (url) => isAppUrl(url || '');

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details.requestingUrl || webContents.getURL();
    callback(allowed.has(permission) && trusted(origin));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
    allowed.has(permission) && trusted(requestingOrigin));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    title: 'BOLT XR | Spatial Wallet',
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Links that open new windows (explorers, GitHub, docs) go to the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });

  // Never navigate the wallet window away from the app.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      openExternally(url);
    }
  });

  if (useDevServer) {
    // The dev server may still be compiling when Electron starts; retry.
    win.webContents.on('did-fail-load', (_event, _code, _desc, validatedURL, isMainFrame) => {
      if (isMainFrame && isAppUrl(validatedURL)) setTimeout(() => win.loadURL(APP_URL), 1000);
    });
  }

  win.loadURL(APP_URL);
  return win;
}

// Refuse <webview> tags and any attempt to open additional web contents.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

// A second launch focuses the existing window instead of opening another vault session.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    registerStaticProtocol();
    configurePermissions();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
