// Unit checks for the game browser's rules (electron/browser-policy.js). Run: pnpm test:browser
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const policy = createRequire(import.meta.url)('../electron/browser-policy.js');
const privacy = createRequire(import.meta.url)('../electron/privacy-policy.js');

const { isAllowedTopLevelUrl: top, isBlockedFrameUrl: blocked, normaliseAddressInput: norm, walletOriginFor: origin, routeProviderMethod: route } = policy;

// Top-level pages
assert.equal(top('https://beam.boltevm.com/play/nft-1'), true);
assert.equal(top('http://localhost:5280/'), true);
assert.equal(top('http://127.0.0.1:5280/'), true);
assert.equal(top('http://beam.boltevm.com/'), false, 'plain http off this machine');
assert.equal(top('http://localhost.evil.com/'), false);
assert.equal(top('file:///C:/Windows/win.ini'), false);
assert.equal(top('app://bolt/'), false, 'the wallet origin is never loadable in the browser');
assert.equal(top('javascript:alert(1)'), false);
assert.equal(top('data:text/html,hi'), false);

// Frames
assert.equal(blocked('file:///etc/passwd'), true);
assert.equal(blocked('app://bolt/index.html'), true);
assert.equal(blocked('chrome://settings'), true);
assert.equal(blocked('https://b3js.example/game'), false);
assert.equal(blocked('about:blank'), false);

// Address bar
assert.equal(norm('beam.boltevm.com'), 'https://beam.boltevm.com/');
assert.equal(norm('localhost:5280/play/nft-1'), 'http://localhost:5280/play/nft-1');
assert.equal(norm('https://beam.boltevm.com/play/nft-1'), 'https://beam.boltevm.com/play/nft-1');
assert.equal(norm('file:///etc/passwd'), null);
assert.equal(norm('app://bolt'), null);
assert.equal(norm('overworld overdrive'), null);
assert.equal(norm(''), null);

// Request attribution
assert.equal(origin('https://beam.boltevm.com/play/nft-1?x=1'), 'https://beam.boltevm.com');
assert.equal(origin('http://localhost:5280/'), 'http://localhost:5280');
assert.equal(origin('app://bolt/'), null);
assert.equal(origin('about:blank'), null);

// Method routing
assert.deepEqual(route('quai_requestAccounts'), { route: 'wallet' });
assert.deepEqual(route('personal_sign'), { route: 'wallet' });
assert.deepEqual(route('quai_sendTransaction'), { route: 'wallet' });
assert.deepEqual(route('quai_getBalance'), { route: 'rpc', method: 'quai_getBalance' });
assert.deepEqual(route('eth_blockNumber'), { route: 'rpc', method: 'quai_blockNumber' });
assert.deepEqual(route('quai_sendRawTransaction'), { route: 'rpc', method: 'quai_sendRawTransaction' });
for (const m of ['eth_sign', 'quai_sign', 'eth_signTransaction', 'eth_signTypedData_v3', 'debug_traceTransaction', 'admin_peers', 'personal_unlockAccount', 'quai_subscribe']) {
  assert.equal(route(m).route, 'refuse', m);
}
assert.equal(route('').route, 'refuse');
assert.equal(route('x'.repeat(100)).route, 'refuse');

// Esc always leaves fullscreen: pages never get keyboard lock.
assert.equal(policy.BROWSER_PERMISSIONS.has('keyboardLock'), false);
for (const p of ['media', 'geolocation', 'notifications', 'hid', 'usb', 'serial', 'openExternal']) assert.equal(policy.BROWSER_PERMISSIONS.has(p), false, p);

// Tracker and third-party cookie shields never block a first-party page.
const doc = 'https://wallet.example/account';
assert.equal(privacy.isThirdParty('https://cdn.wallet.example/a.js', doc), false);
assert.equal(privacy.isThirdParty('https://cdn.other-example.net/a.js', doc), true);
assert.equal(privacy.isTracker('https://www.google-analytics.com/collect', doc), true);
assert.equal(privacy.isTracker('https://www.google-analytics.com/', ''), false, 'top-level navigation is not a tracker request');
assert.equal(privacy.isTracker('https://safe.example/app.js', doc), false);
assert.equal(privacy.isThirdParty('https://shop.example.co.uk/', 'https://cdn.example.co.uk/'), false);
assert.equal(privacy.isThirdParty('https://shop.example.co.uk/', 'https://other.co.uk/'), true);
assert.deepEqual(privacy.shouldBlockRequest({ url: 'https://clarity.ms/collect', documentURL: doc, resourceType: 'script' }, { trackers: true }), 'tracker');
assert.equal(privacy.shouldBlockRequest({ url: 'https://clarity.ms/', documentURL: '', resourceType: 'mainFrame' }, { trackers: true }), null);
assert.equal(privacy.shouldStripCookie({ url: 'https://cdn.other-example.net/a', documentURL: doc }, { thirdPartyCookies: true }), true);
assert.equal(privacy.shouldStripCookie({ url: 'https://cdn.wallet.example/a', documentURL: doc }, { thirdPartyCookies: true }), false);
const headers = { Cookie: 'secret=1', Accept: '*/*' };
assert.equal(privacy.removeHeader(headers, 'cookie'), true);
assert.deepEqual(headers, { Accept: '*/*' });

console.log('browser and privacy policies: all checks passed');
