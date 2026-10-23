const { contextBridge, ipcRenderer } = require('electron');

// Runs in a sandboxed preload for the wallet window only. It exposes the game
// browser controls and the dapp request channel; it never sees keys (signing
// happens in the wallet page itself).

const subscribe = (channel) => (callback) => {
  if (typeof callback !== 'function') return () => undefined;
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

// Development/test RPC overrides, passed by main only in unpackaged builds.
const quaiRpcOverrides = {};
for (const arg of process.argv || []) {
  const match = /^--boltxr-quai-rpc-(mainnet|orchard)=(https?:\/\/.+)$/.exec(arg);
  if (match) quaiRpcOverrides[match[1]] = match[2];
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,
});

contextBridge.exposeInMainWorld('boltxrDesktop', {
  platform: process.platform,
  quaiRpcOverrides,
  browser: {
    open: (input) => ipcRenderer.invoke('browser:open', String(input ?? '')),
    layout: (state) => ipcRenderer.send('browser:layout', state),
    command: (name) => ipcRenderer.send('browser:command', String(name)),
    suspend: (on) => ipcRenderer.send('browser:suspend', !!on),
    onState: subscribe('browser:state'),
    onFullscreen: subscribe('browser:fullscreen'),
    onActivity: subscribe('browser:activity'),
    onNotice: subscribe('browser:notice'),
  },
  dapp: {
    onRequest: subscribe('dapp:request'),
    onPageChanged: subscribe('dapp:page-changed'),
    respond: (id, response) => ipcRenderer.send('dapp:respond', { id, ...(response || {}) }),
    emit: (origin, event, data) => ipcRenderer.send('dapp:emit', { origin, event, data }),
    setNetwork: (network) => ipcRenderer.send('dapp:network', network),
  },
});
