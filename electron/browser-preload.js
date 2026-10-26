/*
 * Preload for pages in the game browser (BEAM and other Quai dapps).
 *
 * It installs a Pelagus-compatible provider as `window.pelagus` (alias
 * `window.quai`) in the page's own world, before any page script runs. BEAM and
 * other Quai dapps detect it exactly like the Pelagus extension and speak the
 * same `quai_*` methods.
 *
 * The provider holds no keys and no state the page could abuse: every request
 * goes to the main process, which attributes it to the frame's real origin (never
 * one the page supplies), answers public reads from the Quai node, and sends
 * everything that touches the account to the wallet window, where the person
 * approves it. Only the top-level page gets the provider; embedded frames
 * (the game iframe) do not.
 */
const { contextBridge, ipcRenderer } = require('electron');

// DevTools-injected keys do not reach Electron's before-input-event. Keep an
// isolated-world Escape path too; page overrides cannot replace this document.
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !document.fullscreenElement) return;
  event.preventDefault();
  document.exitFullscreen().catch(() => undefined);
}, true);

const listeners = new Set();
ipcRenderer.on('dapp:event', (_event, message) => {
  if (!message || typeof message.event !== 'string') return;
  for (const fn of listeners) {
    try {
      fn(message.event, message.data);
    } catch {
      /* a page listener threw; the main-world side reports it */
    }
  }
});

const bridgeRequest = (method, params) =>
  ipcRenderer
    .invoke('dapp:request', { method, params })
    .catch(() => ({ error: { code: -32603, message: 'Bolt XR did not respond' } }));

const bridgeSubscribe = (fn) => {
  listeners.add(fn);
};

/* Runs in the page's main world. Must be self-contained (it is serialized). */
function installProvider(request, subscribe) {
  'use strict';
  if (window.pelagus && window.pelagus.isBoltXR) return;

  class ProviderRpcError extends Error {
    constructor(code, message, data) {
      super(message);
      this.name = 'ProviderRpcError';
      this.code = code;
      if (data !== undefined) this.data = data;
    }
  }

  const listeners = new Map();
  const emit = (event, args) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const entry of Array.from(set)) {
      if (entry.once) set.delete(entry);
      try {
        entry.fn.apply(null, args);
      } catch (err) {
        setTimeout(() => {
          throw err;
        });
      }
    }
  };

  subscribe((event, data) => {
    if (event === 'accountsChanged') emit('accountsChanged', [Array.isArray(data) ? data.slice() : []]);
    else if (event === 'chainChanged') emit('chainChanged', [data]);
    else if (event === 'connect') emit('connect', [{ chainId: data }]);
    else if (event === 'disconnect') emit('disconnect', [new ProviderRpcError(4900, 'Bolt XR disconnected')]);
  });

  // BigInt is not valid JSON-RPC; send it as a quantity like quais does.
  const toWire = (value) => JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? '0x' + v.toString(16) : v)));

  const doRequest = async (args) => {
    if (!args || typeof args !== 'object' || typeof args.method !== 'string') {
      throw new ProviderRpcError(-32600, 'Invalid request: expected { method, params }');
    }
    const params = args.params === undefined ? [] : Array.isArray(args.params) ? args.params : [args.params];
    let response;
    try {
      response = await request(args.method, toWire(params));
    } catch {
      throw new ProviderRpcError(-32603, 'Bolt XR did not respond');
    }
    if (response && response.error) {
      const e = response.error;
      throw new ProviderRpcError(typeof e.code === 'number' ? e.code : -32603, e.message || 'Request failed', e.data);
    }
    return response ? response.result : undefined;
  };

  const addListener = (event, fn, once) => {
    if (typeof fn !== 'function') return;
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add({ fn, once: !!once });
  };
  const removeListener = (event, fn) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const entry of Array.from(set)) if (entry.fn === fn) set.delete(entry);
  };

  const provider = {
    isPelagus: true,
    isBoltXR: true,
    request: (args) => doRequest(args),
    on(event, fn) {
      addListener(event, fn, false);
      return provider;
    },
    addListener(event, fn) {
      addListener(event, fn, false);
      return provider;
    },
    once(event, fn) {
      addListener(event, fn, true);
      return provider;
    },
    removeListener(event, fn) {
      removeListener(event, fn);
      return provider;
    },
    off(event, fn) {
      removeListener(event, fn);
      return provider;
    },
    removeAllListeners(event) {
      if (event === undefined) listeners.clear();
      else listeners.delete(event);
      return provider;
    },
    enable: () => doRequest({ method: 'quai_requestAccounts' }),
    // Legacy web3 transports.
    sendAsync(payload, callback) {
      doRequest(payload).then(
        (result) => callback(null, { id: payload && payload.id, jsonrpc: '2.0', result }),
        (error) => callback(error, { id: payload && payload.id, jsonrpc: '2.0', error: { code: error.code, message: error.message } }),
      );
    },
    send(methodOrPayload, paramsOrCallback) {
      if (typeof methodOrPayload === 'string') return doRequest({ method: methodOrPayload, params: paramsOrCallback });
      if (typeof paramsOrCallback === 'function') return provider.sendAsync(methodOrPayload, paramsOrCallback);
      return doRequest(methodOrPayload);
    },
  };
  Object.freeze(provider);

  // Keep WebXR games fully usable, but return control to the wallet before an
  // approval. Sessions are tracked only in this page; no page can affect another.
  try {
    if (navigator.xr) {
      const xrSessions = new Set();
      const requestSession = navigator.xr.requestSession.bind(navigator.xr);
      Object.defineProperty(navigator.xr, 'requestSession', {
        configurable: true,
        value: async (...args) => {
          const session = await requestSession(...args);
          xrSessions.add(session);
          session.addEventListener('end', () => xrSessions.delete(session), { once: true });
          return session;
        },
      });
      window.addEventListener('boltxr:end-xr', () => {
        for (const session of [...xrSessions]) session.end().catch(() => undefined);
        xrSessions.clear();
      });
    }
  } catch { /* Older runtimes can still play; they may not expose this hook. */ }

  for (const name of ['pelagus', 'quai']) {
    try {
      Object.defineProperty(window, name, { value: provider, configurable: false, enumerable: true, writable: false });
    } catch {
      /* already defined by the page */
    }
  }
  window.dispatchEvent(new Event('pelagus#initialized'));
}

if (typeof contextBridge.executeInMainWorld === 'function') {
  contextBridge.executeInMainWorld({ func: installProvider, args: [bridgeRequest, bridgeSubscribe] });
} else {
  // Older Electron: a bridged object (listener identity is per-call there).
  contextBridge.exposeInMainWorld('pelagus', {
    isPelagus: true,
    isBoltXR: true,
    request: async (args) => {
      const r = await bridgeRequest(args && args.method, (args && args.params) || []);
      if (r && r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code });
      return r && r.result;
    },
    on: (event, fn) => bridgeSubscribe((e, data) => {
      if (e === event) fn(data);
    }),
    removeListener: () => undefined,
  });
}
