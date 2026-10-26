/**
 * Isolated multi-tab Chromium browser with privacy shields and wallet signing.
 * Every tab owns a renderer, storage partition, navigation history and pending
 * request set. Pages never receive keys: approvals go to the trusted wallet UI.
 */
const { WebContentsView, ipcMain, session } = require('electron');
const path = require('node:path');
const policy = require('./browser-policy');
const privacy = require('./privacy-policy');

const ACTIVITY_THROTTLE_MS = 20_000;
const RPC_TIMEOUT_MS = 15_000;
const MAX_PENDING_WALLET_REQUESTS = 16;
const MAX_PARAMS_BYTES = 256 * 1024;
const MAX_TABS = 12;
const ISOLATED_WORLD = 1000;
const EXIT_FULLSCREEN = [{ code: 'document.fullscreenElement ? document.exitFullscreen() : undefined' }];
const DEFAULT_SHIELDS = Object.freeze({ trackers: true, thirdPartyCookies: true });

let current = null;
let handlersInstalled = false;
const rpcError = (code, message, data) => ({ error: data === undefined ? { code, message } : { code, message, data } });
const cleanCount = value => Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

class ChromiumBrowser {
  constructor({ win, isWalletFrame, devMode }) {
    this.win = win;
    this.isWalletFrame = isWalletFrame;
    this.devMode = devMode;
    this.tabs = new Map();
    this.activeId = null;
    this.nextTabId = 1;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.visible = false;
    this.suspended = false;
    const [initialWidth, initialHeight] = win.getContentSize();
    this.bounds = { x: 0, y: 0, width: initialWidth, height: initialHeight };
    this.network = null;
    this.lastActivity = 0;
    win.on('resize', () => {
      if (!this.visible) {
        const [width, height] = win.getContentSize();
        this.bounds = { x: 0, y: 0, width, height };
      }
      this.applyLayout();
    });
    win.on('leave-full-screen', () => {
      const tab = this.activeTab();
      if (tab?.fullscreen) this.exitFullscreen();
    });
    win.on('closed', () => {
      this.failAllPending(4900, 'The wallet window closed');
      for (const tab of this.tabs.values()) tab.session.clearData().catch(() => undefined);
      if (current === this) current = null;
    });
  }

  sendToWallet(channel, payload) {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, payload);
  }

  notify(message) { this.sendToWallet('browser:notice', { message }); }
  activeTab() { return this.activeId === null ? null : this.tabs.get(this.activeId) || null; }

  createTab(input) {
    if (this.tabs.size >= MAX_TABS) {
      this.notify(`Tab limit reached (${MAX_TABS}). Close a tab before opening another.`);
      return null;
    }
    const id = this.nextTabId++;
    const partition = `persist:boltxr-private-tab-${id}`;
    const ses = session.fromPartition(partition);
    const tab = {
      id, partition, session: ses, view: null, fullscreen: false,
      enteredWindowFullscreen: false, lastPopup: 0,
      shields: { ...DEFAULT_SHIELDS }, stats: { trackers: 0, cookies: 0, requests: 0 },
    };
    this.tabs.set(id, tab);
    this.configureSession(tab);
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'browser-preload.js'),
        partition,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        spellcheck: false,
        navigateOnDragDrop: false,
        backgroundThrottling: true,
      },
    });
    tab.view = view;
    view.setBackgroundColor('#020617');
    view.setVisible(false);
    this.win.contentView.addChildView(view);
    this.wireView(tab);
    this.activeId = id;
    if (input) {
      const url = policy.normaliseAddressInput(input);
      if (url) view.webContents.loadURL(url).catch(() => undefined);
    }
    this.applyLayout();
    this.pushState();
    return id;
  }

  configureSession(tab) {
    const ses = tab.session;
    const permissionAllowed = (wc, permission, requestingUrl) => {
      if (!policy.BROWSER_PERMISSIONS.has(permission)) return false;
      if (!['xr', 'vr', 'xr-spatial-tracking'].includes(permission)) return true;
      try {
        return new URL(requestingUrl).origin === new URL(wc.getURL()).origin && policy.isAllowedTopLevelUrl(requestingUrl);
      } catch { return false; }
    };
    ses.setPermissionRequestHandler((wc, permission, callback, details) => callback(permissionAllowed(wc, permission, details.requestingUrl || wc.getURL())));
    ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => permissionAllowed(wc, permission, requestingOrigin || wc.getURL()));
    ses.setDevicePermissionHandler(() => false);
    if (typeof ses.setDisplayMediaRequestHandler === 'function') ses.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    ses.on('will-download', event => {
      event.preventDefault();
      this.notify('Downloads are blocked by Bolt Shield.');
    });
    ses.webRequest.onBeforeRequest((details, callback) => {
      if (details.resourceType !== 'mainFrame') tab.stats.requests++;
      const blocked = privacy.shouldBlockRequest(details, tab.shields);
      if (blocked) tab.stats.trackers++;
      callback({ cancel: !!blocked });
    });
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };
      if (privacy.shouldStripCookie(details, tab.shields) && privacy.removeHeader(headers, 'cookie')) tab.stats.cookies++;
      callback({ requestHeaders: headers });
    });
    ses.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      if (privacy.shouldStripCookie(details, tab.shields) && privacy.removeHeader(headers, 'set-cookie')) tab.stats.cookies++;
      callback({ responseHeaders: headers });
    });
  }

  wireView(tab) {
    const wc = tab.view.webContents;
    const push = () => this.pushState(tab);
    for (const evt of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated', 'dom-ready']) wc.on(evt, push);
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.pushState(tab, { error: `${description || 'Load failed'} (${code})`, failedUrl: url });
    });
    wc.on('render-process-gone', (_e, details) => {
      this.failTabPending(tab, 4900, 'The page stopped');
      this.pushState(tab, { error: `The page stopped (${details.reason}). Reload to continue.` });
    });
    const pageGone = () => {
      this.failTabPending(tab, 4900, 'The page navigated away');
      this.sendToWallet('dapp:page-changed', { tabId: tab.id });
    };
    wc.on('did-start-navigation', details => {
      if (details.isMainFrame && !details.isSameDocument) pageGone();
    });
    wc.on('did-navigate', pageGone);
    wc.on('will-navigate', (event, url) => {
      if (!policy.isAllowedTopLevelUrl(url)) {
        event.preventDefault();
        this.notify(`Blocked unsafe navigation to ${url.slice(0, 120)}`);
      }
    });
    wc.on('will-redirect', (event, _url, _inPlace, isMainFrame) => {
      if (isMainFrame && !policy.isAllowedTopLevelUrl(event.url)) {
        event.preventDefault();
        this.notify(`Blocked unsafe redirect to ${event.url.slice(0, 120)}`);
      }
    });
    wc.on('will-frame-navigate', event => {
      if (policy.isBlockedFrameUrl(event.url)) event.preventDefault();
    });
    wc.setWindowOpenHandler(({ url }) => {
      const now = Date.now();
      if (policy.isAllowedTopLevelUrl(url) && now - tab.lastPopup > 1500) {
        tab.lastPopup = now;
        this.createTab(url);
        this.notify('Opened a new isolated tab.');
      } else {
        this.notify('Blocked an unsafe or repeated pop-up.');
      }
      return { action: 'deny' };
    });
    wc.on('enter-html-full-screen', () => {
      tab.fullscreen = true;
      if (!this.win.isFullScreen()) {
        tab.enteredWindowFullscreen = true;
        this.win.setFullScreen(true);
      }
      this.applyLayout();
      this.pushState(tab);
      this.sendToWallet('browser:fullscreen', { on: true });
    });
    wc.on('leave-html-full-screen', () => {
      tab.fullscreen = false;
      if (tab.enteredWindowFullscreen) {
        tab.enteredWindowFullscreen = false;
        if (this.win.isFullScreen()) this.win.setFullScreen(false);
      }
      this.applyLayout();
      this.pushState(tab);
      this.sendToWallet('browser:fullscreen', { on: false });
    });
    wc.on('before-input-event', (event, input) => {
      if (tab.fullscreen && input.type === 'keyDown' && input.key === 'Escape') {
        event.preventDefault();
        this.exitFullscreen(tab.id);
      }
      if (this.devMode && input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) wc.toggleDevTools();
    });
    wc.on('input-event', (_e, input) => {
      if (!['keyDown', 'rawKeyDown', 'mouseDown', 'touchStart', 'gestureTap'].includes(input.type)) return;
      const now = Date.now();
      if (now - this.lastActivity < ACTIVITY_THROTTLE_MS) return;
      this.lastActivity = now;
      this.sendToWallet('browser:activity', {});
    });
  }

  currentOrigin(tab = this.activeTab()) {
    return tab?.view ? policy.walletOriginFor(tab.view.webContents.getURL()) : null;
  }

  tabState(tab) {
    if (!tab?.view) return null;
    const wc = tab.view.webContents;
    return {
      id: tab.id,
      url: wc.getURL(),
      title: wc.getTitle() || 'New isolated tab',
      loading: wc.isLoading(),
    };
  }

  pushState(tab = this.activeTab(), extra = {}) {
    const active = this.activeTab();
    if (!active) {
      this.sendToWallet('browser:state', {
        tabId: null, tabs: [], url: 'about:blank', origin: null, title: 'Bolt Shield', loading: false,
        canGoBack: false, canGoForward: false, fullscreen: false,
        shields: { ...DEFAULT_SHIELDS }, stats: { trackers: 0, cookies: 0, requests: 0 },
      });
      return;
    }
    // Background events update the tab strip through the active snapshot without
    // replacing the address/title of the page the person is viewing.
    const target = tab || active;
    const wc = active.view.webContents;
    const history = wc.navigationHistory;
    this.sendToWallet('browser:state', {
      tabId: active.id,
      tabs: [...this.tabs.values()].map(item => this.tabState(item)),
      url: wc.getURL(), origin: this.currentOrigin(active), title: wc.getTitle(), loading: wc.isLoading(),
      canGoBack: history ? history.canGoBack() : wc.canGoBack(),
      canGoForward: history ? history.canGoForward() : wc.canGoForward(),
      fullscreen: active.fullscreen,
      shields: { ...active.shields }, stats: { ...active.stats },
      ...(target.id === active.id ? extra : {}),
    });
  }

  applyLayout() {
    for (const tab of this.tabs.values()) {
      const show = tab.id === this.activeId && this.visible && !this.suspended;
      if (tab.fullscreen && show) {
        const [width, height] = this.win.getContentSize();
        tab.view.setBounds({ x: 0, y: 0, width, height });
      } else {
        tab.view.setBounds(this.bounds);
      }
      tab.view.setVisible(show);
    }
    const active = this.activeTab();
    if (active && this.visible && !this.suspended && !active.view.webContents.isFocused()) active.view.webContents.focus();
  }

  open(input, tabId) {
    const url = policy.normaliseAddressInput(input);
    if (!url) return { ok: false, reason: 'Enter an https:// address (or http://localhost for a local build).' };
    let tab = tabId ? this.tabs.get(tabId) : this.activeTab();
    if (!tab) {
      const id = this.createTab();
      tab = this.tabs.get(id);
    }
    this.activeId = tab.id;
    tab.view.webContents.loadURL(url).catch(() => undefined);
    this.applyLayout();
    this.pushState(tab);
    return { ok: true, url, tabId: tab.id };
  }

  closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    this.exitFullscreen(id);
    this.failTabPending(tab, 4900, 'The tab was closed');
    this.win.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
    this.tabs.delete(id);
    tab.session.clearData().catch(() => undefined);
    if (this.activeId === id) this.activeId = this.tabs.keys().next().value ?? null;
    this.applyLayout();
    this.pushState();
  }

  activateTab(id) {
    if (!this.tabs.has(id)) return;
    const previous = this.activeTab();
    if (previous?.fullscreen && previous.id !== id) this.exitFullscreen(previous.id);
    this.activeId = id;
    this.applyLayout();
    this.pushState();
  }

  layout(state) {
    if (!state || typeof state !== 'object') return;
    this.visible = !!state.visible;
    const b = state.bounds || {};
    const width = cleanCount(b.width);
    const height = cleanCount(b.height);
    // Hiding the native view must not collapse the offscreen surface used by WEB.
    this.bounds = { x: cleanCount(b.x), y: cleanCount(b.y), width: width || this.bounds.width, height: height || this.bounds.height };
    this.applyLayout();
  }

  command(name, tabId) {
    const tab = tabId ? this.tabs.get(tabId) : this.activeTab();
    if (!tab) return;
    const wc = tab.view.webContents;
    const history = wc.navigationHistory;
    switch (name) {
      case 'back': if (history?.canGoBack()) history.goBack(); else if (wc.canGoBack()) wc.goBack(); break;
      case 'forward': if (history?.canGoForward()) history.goForward(); else if (wc.canGoForward()) wc.goForward(); break;
      case 'reload': wc.reload(); break;
      case 'stop': wc.stop(); break;
      case 'exit-fullscreen': this.exitFullscreen(tab.id); break;
      case 'leave': this.exitFullscreen(tab.id); wc.loadURL('about:blank').catch(() => undefined); break;
      default: break;
    }
  }

  exitFullscreen(id = this.activeId) {
    const tab = this.tabs.get(id);
    if (!tab?.fullscreen) return;
    tab.view.webContents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, EXIT_FULLSCREEN, true).catch(() => undefined);
    setTimeout(() => {
      if (!this.tabs.has(id) || !tab.fullscreen) return;
      tab.fullscreen = false;
      if (tab.enteredWindowFullscreen) {
        tab.enteredWindowFullscreen = false;
        if (this.win.isFullScreen()) this.win.setFullScreen(false);
      }
      this.applyLayout();
      this.pushState(tab);
    }, 500);
  }

  suspend(on) { this.suspended = !!on; this.applyLayout(); }

  setShield(name, enabled) {
    const tab = this.activeTab();
    if (!tab || !Object.hasOwn(DEFAULT_SHIELDS, name)) return;
    tab.shields[name] = !!enabled;
    this.pushState(tab);
  }

  async clearSiteData() {
    const tab = this.activeTab();
    if (!tab) return;
    await tab.session.clearData();
    tab.stats = { trackers: 0, cookies: 0, requests: 0 };
    this.notify('Active tab cookies, cache, and site storage cleared.');
    this.pushState(tab);
  }

  async capture() {
    const tab = this.activeTab();
    if (!tab || this.suspended) return null;
    const image = await tab.view.webContents.capturePage();
    if (image.isEmpty()) return null;
    const size = image.getSize();
    const scaled = size.width > 1280 ? image.resize({ width: 1280 }) : image;
    return { dataUrl: `data:image/jpeg;base64,${scaled.toJPEG(78).toString('base64')}`, width: scaled.getSize().width, height: scaled.getSize().height };
  }

  input(payload) {
    const tab = this.activeTab();
    if (!tab || this.suspended || !payload || typeof payload !== 'object') return;
    const wc = tab.view.webContents;
    const { width, height } = tab.view.getBounds();
    const x = Math.max(0, Math.min(width - 1, Math.round(Number(payload.x) * width)));
    const y = Math.max(0, Math.min(height - 1, Math.round(Number(payload.y) * height)));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (payload.type === 'click') {
      wc.sendInputEvent({ type: 'mouseMove', x, y });
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    } else if (payload.type === 'scroll') {
      wc.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: Math.max(-1000, Math.min(1000, Number(payload.deltaY) || 0)) });
    }
  }

  setNetwork(net) {
    if (!net || !Number.isInteger(net.chainId) || typeof net.rpc !== 'string' || !policy.isAllowedTopLevelUrl(net.rpc)) return;
    this.network = { chainId: net.chainId, rpc: net.rpc };
    this.pushState();
  }

  emit(message) {
    if (!message || typeof message.event !== 'string') return;
    for (const tab of this.tabs.values()) {
      const origin = this.currentOrigin(tab);
      if (!origin || (message.origin !== '*' && message.origin !== origin)) continue;
      if (message.origin === '*' && message.event !== 'chainChanged') continue;
      tab.view.webContents.send('dapp:event', { event: message.event, data: message.data });
    }
  }

  respond(message) {
    const entry = this.pending.get(message?.id);
    if (!entry) return;
    this.pending.delete(message.id);
    if (message.error) entry.resolve(rpcError(Number(message.error.code) || -32603, String(message.error.message || 'Request failed')));
    else entry.resolve({ result: message.result === undefined ? null : message.result });
  }

  failTabPending(tab, code, message) {
    for (const [id, entry] of this.pending) {
      if (entry.tab.id !== tab.id) continue;
      this.pending.delete(id);
      entry.resolve(rpcError(code, message));
    }
  }

  failAllPending(code, message) {
    for (const [id, entry] of this.pending) {
      this.pending.delete(id);
      entry.resolve(rpcError(code, message));
    }
  }

  async handleProviderRequest(event, payload) {
    const tab = [...this.tabs.values()].find(item => event.sender === item.view.webContents);
    if (!tab) return rpcError(4100, 'Unauthorized');
    if (!event.senderFrame || event.senderFrame !== tab.view.webContents.mainFrame) return rpcError(4100, 'Only the top-level page can use the wallet');
    const origin = policy.walletOriginFor(event.senderFrame.url);
    if (!origin) return rpcError(4100, 'This page cannot use the wallet');
    const method = payload && payload.method;
    const params = payload && Array.isArray(payload.params) ? payload.params : [];
    let size = 0;
    try { size = JSON.stringify(params).length; } catch { return rpcError(-32602, 'Parameters must be JSON'); }
    if (size > MAX_PARAMS_BYTES) return rpcError(-32602, 'Request too large');
    const route = policy.routeProviderMethod(method);
    if (route.route === 'refuse') return rpcError(route.code, route.message);
    if (route.route === 'rpc') return this.proxyRpc(route.method, params);
    if (this.win.isDestroyed()) return rpcError(4900, 'The wallet window is closed');
    if (this.pending.size >= MAX_PENDING_WALLET_REQUESTS) return rpcError(-32002, 'Too many requests are waiting for the wallet');
    const id = this.nextRequestId++;
    const frame = event.senderFrame;
    return new Promise(resolve => {
      this.pending.set(id, {
        tab,
        resolve: value => resolve(frame.detached || frame !== tab.view.webContents.mainFrame ? rpcError(4900, 'The page navigated away') : value),
      });
      // A game must never keep the person inside its immersive scene while the
      // wallet asks for a signature. The preload ends only its tracked XR sessions.
      tab.view.webContents.executeJavaScript("window.dispatchEvent(new Event('boltxr:end-xr'))", true).catch(() => undefined);
      this.sendToWallet('dapp:request', { id, tabId: tab.id, origin, method, params });
      this.pushState();
    });
  }

  async proxyRpc(method, params) {
    if (!this.network) return rpcError(4900, 'Bolt XR has not selected a Quai network yet');
    try {
      const response = await fetch(this.network.rpc, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      const body = await response.json().catch(() => null);
      if (!body || typeof body !== 'object') return rpcError(-32603, `Quai node returned HTTP ${response.status}`);
      if (body.error) return rpcError(Number(body.error.code) || -32603, String(body.error.message || 'RPC error'), body.error.data);
      return { result: body.result === undefined ? null : body.result };
    } catch (e) {
      return rpcError(-32603, `Quai node unreachable (${e?.name === 'TimeoutError' ? 'timed out' : 'network error'})`);
    }
  }
}

function installHandlers() {
  if (handlersInstalled) return;
  handlersInstalled = true;
  const fromWallet = event => current && current.isWalletFrame(event);
  ipcMain.handle('browser:open', (event, input, tabId) => fromWallet(event) ? current.open(input, tabId) : { ok: false, reason: 'Unauthorized' });
  ipcMain.handle('browser:new-tab', event => fromWallet(event) ? current.createTab() : null);
  ipcMain.handle('browser:capture', event => fromWallet(event) ? current.capture() : null);
  ipcMain.handle('browser:clear-data', event => fromWallet(event) ? current.clearSiteData() : undefined);
  ipcMain.on('browser:layout', (event, state) => fromWallet(event) && current.layout(state));
  ipcMain.on('browser:command', (event, name, tabId) => fromWallet(event) && current.command(name, tabId));
  ipcMain.on('browser:close-tab', (event, id) => fromWallet(event) && current.closeTab(Number(id)));
  ipcMain.on('browser:activate-tab', (event, id) => fromWallet(event) && current.activateTab(Number(id)));
  ipcMain.on('browser:shield', (event, name, enabled) => fromWallet(event) && current.setShield(String(name), enabled));
  ipcMain.on('browser:input', (event, payload) => fromWallet(event) && current.input(payload));
  ipcMain.on('browser:suspend', (event, on) => fromWallet(event) && current.suspend(on));
  ipcMain.on('dapp:respond', (event, message) => fromWallet(event) && current.respond(message));
  ipcMain.on('dapp:emit', (event, message) => fromWallet(event) && current.emit(message));
  ipcMain.on('dapp:network', (event, net) => fromWallet(event) && current.setNetwork(net));
  ipcMain.handle('dapp:request', (event, payload) => current ? current.handleProviderRequest(event, payload) : rpcError(4900, 'Bolt XR is not ready'));
}

function attachGameBrowser(options) {
  installHandlers();
  current = new ChromiumBrowser(options);
  return current;
}

module.exports = { attachGameBrowser, MAX_TABS, DEFAULT_SHIELDS };
