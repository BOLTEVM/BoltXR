/**
 * The game browser: a sandboxed web view inside the wallet window that plays
 * BEAM games (Overworld Overdrive) and lets their pages use the wallet's Quai
 * account through a Pelagus-compatible provider (see browser-preload.js).
 *
 * Isolation:
 *  - Its own session partition, so a site never shares cookies, storage or
 *    permissions with the wallet's app://bolt origin.
 *  - Its own renderer process (WebContentsView), sandboxed, context isolated,
 *    no Node. The wallet's keys live only in the wallet window's renderer.
 *  - Requests are attributed to the origin Electron reports for the sending
 *    frame. Only the top-level document can use the provider.
 *  - While the wallet asks the person to approve something, the page is hidden,
 *    so it can never draw over or under the approval.
 *  - Top-level pages are https (or http on this machine); file:, app: and
 *    browser-internal schemes are refused in every frame. Downloads are blocked;
 *    new windows open in the system browser.
 */
const { WebContentsView, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const policy = require('./browser-policy');

const PARTITION = 'persist:boltxr-game-browser';
const ACTIVITY_THROTTLE_MS = 20_000;
const RPC_TIMEOUT_MS = 15_000;
const MAX_PENDING_WALLET_REQUESTS = 16;
const MAX_PARAMS_BYTES = 256 * 1024;
const EXTERNAL_OPEN_INTERVAL_MS = 3_000;
// Runs in an isolated world: the page cannot replace document.exitFullscreen there.
const EXIT_FULLSCREEN = [{ code: 'document.fullscreenElement ? document.exitFullscreen() : undefined' }];
const ISOLATED_WORLD = 1000;

let current = null; // the controller for the live wallet window
let handlersInstalled = false;
const configuredSessions = new WeakSet();

const rpcError = (code, message, data) => ({ error: data === undefined ? { code, message } : { code, message, data } });

function configureSession(ses, notify) {
  if (configuredSessions.has(ses)) return;
  configuredSessions.add(ses);

  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(policy.BROWSER_PERMISSIONS.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => policy.BROWSER_PERMISSIONS.has(permission));
  ses.setDevicePermissionHandler(() => false);
  if (typeof ses.setDisplayMediaRequestHandler === 'function') {
    ses.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  }
  ses.on('will-download', (event, item) => {
    event.preventDefault();
    notify(`Downloads are turned off in the game browser (${item.getFilename()}).`);
  });
}

class GameBrowser {
  constructor({ win, isWalletFrame, devMode }) {
    this.win = win;
    this.isWalletFrame = isWalletFrame;
    this.devMode = devMode;
    this.view = null;
    this.visible = false;
    this.suspended = false;
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    this.htmlFullscreen = false;
    this.enteredWindowFullscreen = false;
    this.network = null; // { chainId, rpc }
    this.pending = new Map(); // id -> { resolve, frame }
    this.lastExternalOpen = 0;
    this.nextId = 1;
    this.lastActivity = 0;

    win.on('resize', () => this.applyLayout());
    win.on('leave-full-screen', () => {
      if (this.htmlFullscreen) this.exitFullscreen();
    });
    win.on('closed', () => {
      this.failAllPending(4900, 'The wallet window closed');
      if (current === this) current = null;
    });
  }

  sendToWallet(channel, payload) {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  notify(message) {
    this.sendToWallet('browser:notice', { message });
  }

  // ── View lifecycle ─────────────────────────────────────────────

  ensureView() {
    if (this.view) return this.view;
    const ses = session.fromPartition(PARTITION);
    configureSession(ses, (m) => current && current.notify(m));

    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'browser-preload.js'),
        partition: PARTITION,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        spellcheck: false,
        navigateOnDragDrop: false,
      },
    });
    view.setBackgroundColor('#020617');
    view.setVisible(false);
    this.win.contentView.addChildView(view);
    this.view = view;
    this.wireView(view.webContents);
    return view;
  }

  wireView(wc) {
    const push = () => this.pushState();
    for (const evt of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated', 'dom-ready']) {
      wc.on(evt, push);
    }
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 /* ABORTED */) this.pushState({ error: `${description || 'Load failed'} (${code})`, failedUrl: url });
    });
    wc.on('render-process-gone', (_e, details) => {
      this.failAllPending(4900, 'The page stopped');
      this.pushState({ error: `The page stopped (${details.reason}). Reload to continue.` });
    });

    // A new document means a new page: nothing the old one asked for is still
    // wanted. Checked at start and again at commit, so a request the old page
    // sent in between never surfaces over the new site.
    const pageGone = () => {
      this.failAllPending(4900, 'The page navigated away');
      this.sendToWallet('dapp:page-changed', {});
    };
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) pageGone();
    });
    wc.on('did-navigate', pageGone);

    wc.on('will-navigate', (event, url) => {
      if (!policy.isAllowedTopLevelUrl(url)) {
        event.preventDefault();
        this.notify(`Blocked navigation to ${url.slice(0, 120)}`);
      }
    });
    wc.on('will-redirect', (event) => {
      if (event.isMainFrame && !policy.isAllowedTopLevelUrl(event.url)) {
        event.preventDefault();
        this.notify(`Blocked redirect to ${event.url.slice(0, 120)}`);
      }
    });
    wc.on('will-frame-navigate', (event) => {
      if (policy.isBlockedFrameUrl(event.url)) event.preventDefault();
    });

    // New windows open in the system browser, at most one every few seconds.
    wc.setWindowOpenHandler(({ url }) => {
      try {
        const { protocol } = new URL(url);
        const now = Date.now();
        if ((protocol === 'https:' || protocol === 'http:') && now - this.lastExternalOpen >= EXTERNAL_OPEN_INTERVAL_MS) {
          this.lastExternalOpen = now;
          shell.openExternal(url);
          this.notify(`Opened in your browser: ${url.slice(0, 120)}`);
        }
      } catch {
        /* malformed */
      }
      return { action: 'deny' };
    });

    wc.on('enter-html-full-screen', () => {
      this.htmlFullscreen = true;
      if (!this.win.isFullScreen()) {
        this.enteredWindowFullscreen = true;
        this.win.setFullScreen(true);
      }
      this.applyLayout();
      this.pushState();
      this.sendToWallet('browser:fullscreen', { on: true });
    });
    wc.on('leave-html-full-screen', () => {
      this.htmlFullscreen = false;
      if (this.enteredWindowFullscreen) {
        this.enteredWindowFullscreen = false;
        if (this.win.isFullScreen()) this.win.setFullScreen(false);
      }
      this.applyLayout();
      this.pushState();
      this.sendToWallet('browser:fullscreen', { on: false });
    });

    // Esc always leaves a fullscreen page, whatever the page does with the key.
    wc.on('before-input-event', (event, input) => {
      if (this.htmlFullscreen && input.type === 'keyDown' && input.key === 'Escape') {
        event.preventDefault();
        this.exitFullscreen();
      }
    });

    // Playing counts as being at the wallet: the vault's inactivity lock should
    // not fire mid-raid. Only real input counts — never a page's requests.
    wc.on('input-event', (_e, input) => {
      if (!['keyDown', 'rawKeyDown', 'mouseDown', 'touchStart', 'gestureTap'].includes(input.type)) return;
      const now = Date.now();
      if (now - this.lastActivity < ACTIVITY_THROTTLE_MS) return;
      this.lastActivity = now;
      this.sendToWallet('browser:activity', {});
    });

    if (this.devMode) {
      wc.on('before-input-event', (_e, input) => {
        if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
          wc.toggleDevTools();
        }
      });
    }
  }

  currentOrigin() {
    if (!this.view) return null;
    return policy.walletOriginFor(this.view.webContents.getURL());
  }

  pushState(extra = {}) {
    if (!this.view) return;
    const wc = this.view.webContents;
    const history = wc.navigationHistory;
    this.sendToWallet('browser:state', {
      url: wc.getURL(),
      origin: this.currentOrigin(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: history ? history.canGoBack() : wc.canGoBack(),
      canGoForward: history ? history.canGoForward() : wc.canGoForward(),
      fullscreen: this.htmlFullscreen,
      ...extra,
    });
  }

  applyLayout() {
    if (!this.view) return;
    const show = this.visible && !this.suspended;
    if (this.htmlFullscreen) {
      const [width, height] = this.win.getContentSize();
      this.view.setBounds({ x: 0, y: 0, width, height });
    } else {
      this.view.setBounds(this.bounds);
    }
    this.view.setVisible(show);
    if (show && !this.view.webContents.isFocused()) this.view.webContents.focus();
  }

  // ── Commands from the wallet window ────────────────────────────

  open(input) {
    const url = policy.normaliseAddressInput(input);
    if (!url) return { ok: false, reason: 'Enter an https:// address (or http://localhost for a local build).' };
    const view = this.ensureView();
    view.webContents.loadURL(url).catch(() => undefined); // failures arrive via did-fail-load
    this.pushState();
    return { ok: true, url };
  }

  layout(state) {
    if (!state || typeof state !== 'object') return;
    this.visible = !!state.visible;
    const b = state.bounds || {};
    const n = (v) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
    this.bounds = { x: n(b.x), y: n(b.y), width: n(b.width), height: n(b.height) };
    if (this.visible) this.ensureView();
    this.applyLayout();
  }

  command(name) {
    if (!this.view) return;
    const wc = this.view.webContents;
    const history = wc.navigationHistory;
    switch (name) {
      case 'back':
        if (history && history.canGoBack()) history.goBack();
        else if (!history && wc.canGoBack()) wc.goBack();
        break;
      case 'forward':
        if (history && history.canGoForward()) history.goForward();
        else if (!history && wc.canGoForward()) wc.goForward();
        break;
      case 'reload':
        wc.reload();
        break;
      case 'stop':
        wc.stop();
        break;
      case 'exit-fullscreen':
        this.exitFullscreen();
        break;
      case 'leave':
        // "Reject and leave this site": unload the page entirely.
        this.exitFullscreen();
        wc.loadURL('about:blank').catch(() => undefined);
        break;
      default:
        break;
    }
  }

  /** Leave page fullscreen even if the page has patched its own exitFullscreen. */
  exitFullscreen() {
    if (!this.view || !this.htmlFullscreen) return;
    const wc = this.view.webContents;
    wc.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, EXIT_FULLSCREEN, true).catch(() => undefined);
    // If the page never leaves, take the window out ourselves.
    setTimeout(() => {
      if (!this.htmlFullscreen) return;
      this.htmlFullscreen = false;
      if (this.enteredWindowFullscreen) {
        this.enteredWindowFullscreen = false;
        if (this.win.isFullScreen()) this.win.setFullScreen(false);
      }
      this.applyLayout();
      this.pushState();
    }, 500);
  }

  suspend(on) {
    this.suspended = !!on;
    this.applyLayout();
  }

  setNetwork(net) {
    if (!net || !Number.isInteger(net.chainId) || typeof net.rpc !== 'string') return;
    if (!policy.isAllowedTopLevelUrl(net.rpc)) return;
    const changed = !this.network || this.network.chainId !== net.chainId;
    this.network = { chainId: net.chainId, rpc: net.rpc };
    if (changed) this.pushState();
  }

  /** Deliver a provider event to the page, if it is the origin it concerns. */
  emit(message) {
    if (!this.view || !message || typeof message.event !== 'string') return;
    const origin = this.currentOrigin();
    if (!origin) return;
    // Account data only goes to the origin it was granted to; chainChanged is public.
    if (message.origin !== '*' && message.origin !== origin) return;
    if (message.origin === '*' && message.event !== 'chainChanged') return;
    this.view.webContents.send('dapp:event', { event: message.event, data: message.data });
  }

  respond(message) {
    if (!message) return;
    const entry = this.pending.get(message.id);
    if (!entry) return;
    this.pending.delete(message.id);
    const { resolve } = entry;
    if (message.error) resolve(rpcError(Number(message.error.code) || -32603, String(message.error.message || 'Request failed')));
    else resolve({ result: message.result === undefined ? null : message.result });
  }

  failAllPending(code, message) {
    for (const [id, entry] of this.pending) {
      this.pending.delete(id);
      entry.resolve(rpcError(code, message));
    }
  }

  // ── Provider requests from the page ────────────────────────────

  async handleProviderRequest(event, payload) {
    const view = this.view;
    if (!view || event.sender !== view.webContents) return rpcError(4100, 'Unauthorized');
    // Only the top-level document gets the wallet; never an embedded frame.
    if (!event.senderFrame || event.senderFrame !== view.webContents.mainFrame) return rpcError(4100, 'Only the top-level page can use the wallet');
    const origin = policy.walletOriginFor(event.senderFrame.url);
    if (!origin) return rpcError(4100, 'This page cannot use the wallet');

    const method = payload && payload.method;
    const params = payload && Array.isArray(payload.params) ? payload.params : [];
    let size = 0;
    try {
      size = JSON.stringify(params).length;
    } catch {
      return rpcError(-32602, 'Parameters must be JSON');
    }
    if (size > MAX_PARAMS_BYTES) return rpcError(-32602, 'Request too large');

    const route = policy.routeProviderMethod(method);
    if (route.route === 'refuse') return rpcError(route.code, route.message);
    if (route.route === 'rpc') return this.proxyRpc(route.method, params);

    if (this.win.isDestroyed()) return rpcError(4900, 'The wallet window is closed');
    if (this.pending.size >= MAX_PENDING_WALLET_REQUESTS) return rpcError(-32002, 'Too many requests are waiting for the wallet');
    const id = this.nextId++;
    const frame = event.senderFrame;
    return new Promise((resolve) => {
      // The reply only goes back to the document that asked.
      this.pending.set(id, {
        frame,
        resolve: (value) => resolve(frame.detached || frame !== view.webContents.mainFrame ? rpcError(4900, 'The page navigated away') : value),
      });
      this.sendToWallet('dapp:request', { id, origin, method, params });
    });
  }

  async proxyRpc(method, params) {
    if (!this.network) return rpcError(4900, 'Bolt XR has not selected a Quai network yet');
    try {
      const response = await fetch(this.network.rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      const body = await response.json().catch(() => null);
      if (!body || typeof body !== 'object') return rpcError(-32603, `Quai node returned HTTP ${response.status}`);
      if (body.error) return rpcError(Number(body.error.code) || -32603, String(body.error.message || 'RPC error'), body.error.data);
      return { result: body.result === undefined ? null : body.result };
    } catch (e) {
      return rpcError(-32603, `Quai node unreachable (${e && e.name === 'TimeoutError' ? 'timed out' : 'network error'})`);
    }
  }
}

function installHandlers() {
  if (handlersInstalled) return;
  handlersInstalled = true;

  const fromWallet = (event) => current && current.isWalletFrame(event);

  ipcMain.handle('browser:open', (event, input) => (fromWallet(event) ? current.open(input) : { ok: false, reason: 'Unauthorized' }));
  ipcMain.on('browser:layout', (event, state) => fromWallet(event) && current.layout(state));
  ipcMain.on('browser:command', (event, name) => fromWallet(event) && current.command(name));
  ipcMain.on('browser:suspend', (event, on) => fromWallet(event) && current.suspend(on));
  ipcMain.on('dapp:respond', (event, message) => fromWallet(event) && current.respond(message));
  ipcMain.on('dapp:emit', (event, message) => fromWallet(event) && current.emit(message));
  ipcMain.on('dapp:network', (event, net) => fromWallet(event) && current.setNetwork(net));

  ipcMain.handle('dapp:request', (event, payload) => (current ? current.handleProviderRequest(event, payload) : rpcError(4900, 'Bolt XR is not ready')));
}

/**
 * Attach the game browser to the wallet window.
 * @param {{ win: Electron.BrowserWindow, isWalletFrame: (event: Electron.IpcMainEvent) => boolean, devMode: boolean }} options
 */
function attachGameBrowser(options) {
  installHandlers();
  current = new GameBrowser(options);
  return current;
}

module.exports = { attachGameBrowser, PARTITION };
