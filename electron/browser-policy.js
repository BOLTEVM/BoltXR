/**
 * Pure rules for the game browser, kept free of Electron APIs so they can be
 * tested with plain Node (see scripts/test-browser-policy.mjs).
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Sites the browser opens from its home screen. */
const HOME_SITES = [
  {
    id: 'overworld',
    title: 'Overworld Overdrive',
    subtitle: 'BOLTEVM MMORPG on BEAM',
    url: 'https://beam.boltevm.com/play/nft-1',
  },
  {
    id: 'beam',
    title: 'BEAM Store',
    subtitle: 'beam.boltevm.com',
    url: 'https://beam.boltevm.com/',
  },
];

const parse = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

/** A page the browser may show as its top-level document: https, or http on this machine. */
function isAllowedTopLevelUrl(value) {
  const url = parse(value);
  if (!url) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
}

/** Schemes a frame (including the game iframe) must never load inside the browser. */
function isBlockedFrameUrl(value) {
  const url = parse(value);
  if (!url) return false;
  return ['file:', 'app:', 'chrome:', 'devtools:', 'chrome-extension:', 'view-source:'].includes(url.protocol);
}

/**
 * Turn address-bar input into a URL. Bare hosts get https:// (http:// for
 * localhost); anything that is not a loadable URL returns null.
 */
function normaliseAddressInput(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  const direct = parse(text);
  if (direct && (direct.protocol === 'https:' || direct.protocol === 'http:')) {
    return isAllowedTopLevelUrl(direct.href) ? direct.href : null;
  }
  if (/\s/.test(text) || !/^[\w.-]+(:\d+)?(\/.*)?$/.test(text)) return null;
  const host = text.split(/[/:]/)[0];
  const scheme = LOCAL_HOSTS.has(host) ? 'http://' : 'https://';
  const url = parse(scheme + text);
  return url && isAllowedTopLevelUrl(url.href) ? url.href : null;
}

/** Origin a request is attributed to; null when the page may not use the wallet. */
function walletOriginFor(frameUrl) {
  const url = parse(frameUrl);
  if (!url || !isAllowedTopLevelUrl(url.href)) return null;
  return url.origin;
}

// Methods the wallet window answers (accounts, signatures, transactions, network).
const WALLET_METHODS = new Set([
  'quai_requestAccounts', 'eth_requestAccounts',
  'quai_accounts', 'eth_accounts',
  'quai_chainId', 'eth_chainId', 'net_version',
  'personal_sign',
  'quai_sendTransaction', 'eth_sendTransaction',
  'quai_signTypedData_v4', 'eth_signTypedData_v4',
  'wallet_switchEthereumChain', 'wallet_switchQuaiChain', 'wallet_addEthereumChain',
  'wallet_requestPermissions', 'wallet_getPermissions', 'wallet_revokePermissions',
  'wallet_watchAsset',
]);

// Signing methods nobody gets: raw-hash signing can sign anything, including transactions.
const REFUSED_METHODS = new Set([
  'eth_sign', 'quai_sign', 'eth_signTransaction', 'quai_signTransaction',
  'eth_signTypedData', 'eth_signTypedData_v1', 'eth_signTypedData_v3',
  'quai_signTypedData', 'quai_signTypedData_v1', 'quai_signTypedData_v3',
]);

/**
 * Where a provider request goes:
 *  - { route: 'wallet' }         → the wallet window (may ask the user)
 *  - { route: 'rpc', method }    → public Quai node, read-only (eth_* names mapped to quai_*)
 *  - { route: 'refuse', code, message }
 */
function routeProviderMethod(method) {
  if (typeof method !== 'string' || method.length === 0 || method.length > 64) {
    return { route: 'refuse', code: -32600, message: 'Invalid request' };
  }
  if (WALLET_METHODS.has(method)) return { route: 'wallet' };
  if (REFUSED_METHODS.has(method)) return { route: 'refuse', code: 4200, message: `${method} is not supported by Bolt XR` };
  if (/^(quai|eth)_(subscribe|unsubscribe|newFilter|newBlockFilter|newPendingTransactionFilter|getFilterChanges|getFilterLogs|uninstallFilter)$/.test(method)) {
    return { route: 'refuse', code: 4200, message: `${method} needs a websocket provider` };
  }
  const read = /^(quai|eth)_([A-Za-z]+)$/.exec(method);
  if (read) return { route: 'rpc', method: `quai_${read[2]}` };
  if (method === 'web3_clientVersion' || method === 'net_listening') return { route: 'rpc', method };
  return { route: 'refuse', code: 4200, message: `${method} is not supported by Bolt XR` };
}

/**
 * Permissions a page in the game browser gets. Everything else is refused.
 * No keyboardLock: Esc must always take the person out of a fullscreen page.
 */
const BROWSER_PERMISSIONS = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'xr', 'vr', 'xr-spatial-tracking']);

module.exports = {
  HOME_SITES,
  isAllowedTopLevelUrl,
  isBlockedFrameUrl,
  normaliseAddressInput,
  walletOriginFor,
  routeProviderMethod,
  BROWSER_PERMISSIONS,
};
