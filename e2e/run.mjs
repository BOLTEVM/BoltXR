/**
 * End-to-end: the real Bolt XR desktop app (Electron, static export) + the game
 * browser + a page built from BEAM's own wallet code + a verifying mock Quai node.
 */
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { Interface } from 'quais';
import { startServers, PASS } from './servers.mjs';
import { buildDapp } from './build-dapp.mjs';

// Usage: pnpm build && pnpm test:e2e   (Linux CI: wrap in xvfb-run -a)
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WALLET = path.resolve(HERE, '..');
const ELECTRON = createRequire(import.meta.url)('electron'); // path to the Electron binary
if (!existsSync(path.join(WALLET, 'out', 'index.html'))) {
  console.error('No static export in out/. Run `pnpm build` first.');
  process.exit(2);
}
const BUNDLE = await buildDapp();
const PHRASE = 'test test test test test test test test test test test junk';
const ADDRESS = '0x00567E10B175ee3CEb16bFC6E9595d8B9b719C36'; // Pelagus account 1 for PHRASE (quais vectors)
const PIN = '470913';
const SHOTS = path.join(HERE, '.out', 'shots');
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const servers = await startServers({ nodePort: 8549, beamPort: 5280, framePort: 5290, bundlePath: BUNDLE });
// A throwaway profile: the run never touches your real Bolt XR vault.
const cfg = mkdtempSync(path.join(os.tmpdir(), 'bxr-'));
const app = await electron.launch({
  executablePath: ELECTRON,
  args: [WALLET, '--serve-static', ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : [])],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, BOLTXR_USER_DATA_DIR: cfg, XDG_CONFIG_HOME: cfg, BOLTXR_QUAI_RPC_MAINNET: 'http://127.0.0.1:8549/cyprus1' },
  timeout: 60000,
});

const win = await app.firstWindow();
win.on('pageerror', (e) => console.log('[wallet pageerror]', e.message));
await win.setViewportSize?.({ width: 1280, height: 800 }).catch(() => undefined);

const approval = (kind) => win.locator(kind ? `[data-testid="dapp-approval"][data-kind="${kind}"]` : '[data-testid="dapp-approval"]');
const viewVisible = () => app.evaluate(({ BrowserWindow }) => {
  const [w] = BrowserWindow.getAllWindows();
  const view = w.contentView.children.find((c) => c.webContents);
  return view ? view.getVisible() : null;
});
const approvalKind = async () => approval().getAttribute('data-kind');
const footerButton = (name) => win.locator('.dialog-footer').getByRole('button', { name, exact: true });
const clickPin = async (pin) => {
  for (const d of pin) await win.locator('.dialog .pin-pad').getByRole('button', { name: d, exact: true }).click();
};
const windowFullscreen = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());

let dapp;
const lastLog = async (action) => {
  await dapp.waitForFunction((a) => window.__log.some((l) => l.action === a), action, { timeout: 30000 });
  return dapp.evaluate((a) => [...window.__log].reverse().find((l) => l.action === a), action);
};
const clearLog = () => dapp.evaluate(() => { window.__log = []; });
const events = () => dapp.evaluate(() => window.__events);

try {
  // ── Open the browser and restore a Pelagus phrase ──
  await win.getByTestId('open-game-browser').click();
  await win.getByTestId('game-browser').waitFor({ timeout: 60000 });
  await win.getByTestId('account-pill').click();
  await win.getByRole('button', { name: /Restore from recovery phrase/ }).click();
  await win.locator('textarea').fill(PHRASE);
  await win.getByRole('button', { name: 'Continue', exact: true }).click();
  await win.getByText(/Pick a PIN of at least/).waitFor();
  await clickPin(PIN);
  await win.getByRole('button', { name: 'Continue', exact: true }).click();
  await win.getByText('Enter the same PIN again.').waitFor();
  await clickPin(PIN);
  await win.getByRole('button', { name: 'Restore', exact: true }).click();
  await win.getByTestId('account-pill').filter({ hasText: '0x0056' }).waitFor({ timeout: 60000 });
  const shown = await win.getByTestId('account-pill').getAttribute('title');
  check('Restored phrase shows the Pelagus Cyprus-1 address', shown?.startsWith(ADDRESS), shown?.split('\n')[0]);
  await win.screenshot({ path: `${SHOTS}/01-browser-home.png` });

  // ── Load the BEAM page ──
  const addressBar = win.getByLabel('Address');
  await addressBar.click();
  await addressBar.fill('localhost:5280/play/nft-1');
  await addressBar.press('Enter');
  const deadline = Date.now() + 30000;
  while (!dapp && Date.now() < deadline) {
    dapp = app.context().pages().find((p) => p.url().startsWith('http://localhost:5280'));
    if (!dapp) await new Promise((r) => setTimeout(r, 250));
  }
  if (!dapp) throw new Error('browser page never appeared');
  dapp.on('pageerror', (e) => console.log('[dapp pageerror]', e.message));
  await dapp.waitForFunction(() => window.__state && 'detected' in window.__state);
  const state = await dapp.evaluate(() => window.__state);
  check('BEAM detects the wallet as a Quai (Pelagus-compatible) wallet', state.detected === 'Pelagus' && state.isBoltXR, JSON.stringify(state));
  check('No window.ethereum is injected', state.hasEthereum === false);
  await dapp.waitForFunction(() => window.__frame !== undefined, null, { timeout: 15000 });
  check('The game iframe (other origin) gets no provider', (await dapp.evaluate(() => window.__frame)) === false);
  await win.screenshot({ path: `${SHOTS}/02-beam-page.png` });
  const capture = await win.evaluate(() => window.boltxrDesktop.browser.capture());
  check('Spatial browser receives a live Chromium page capture', capture?.dataUrl.startsWith('data:image/jpeg;base64,') && capture.dataUrl.length > 1000 && capture.width > 0 && capture.height > 0, capture ? `${capture.width}×${capture.height}` : 'no capture');

  // ── Multi-tab isolation, WebXR, and privacy controls ──
  const xrApi = await dapp.evaluate(() => ({ available: !!navigator.xr, requestSession: typeof navigator.xr?.requestSession === 'function' }));
  check('WebXR game API is available in the Chromium tab', xrApi.available && xrApi.requestSession, JSON.stringify(xrApi));
  await win.getByTestId('new-tab').click();
  await addressBar.fill('localhost:5290');
  await addressBar.press('Enter');
  const second = await app.context().waitForEvent('page', { timeout: 15000 }).catch(() => null) || app.context().pages().find(p => p.url().startsWith('http://localhost:5290'));
  check('New tab opens a second Chromium page', !!second && (await win.locator('[data-testid^="browser-tab-"]').count()) === 2);
  const isolated = await app.evaluate(({ BrowserWindow }) => {
    const views = BrowserWindow.getAllWindows()[0].contentView.children.filter(c => c.webContents);
    return views.length === 2 && views[0].webContents.session !== views[1].webContents.session;
  });
  check('Tabs use separate cookie and storage sessions', isolated);
  const ephemeral = await app.evaluate(({ BrowserWindow }) => {
    const views = BrowserWindow.getAllWindows()[0].contentView.children.filter(c => c.webContents);
    return views.every(view => view.webContents.session.getStoragePath() === null);
  });
  check('Tab storage is ephemeral and cannot leak into a later app run', ephemeral);
  await second.waitForFunction(() => document.cookie.includes('firstParty=seed'));
  check('First-party cookies still work in an isolated tab', (await second.evaluate(() => document.cookie)).includes('firstParty=seed'));
  await win.getByTestId('browser-tab-1').click();
  await dapp.waitForFunction(() => window.__state && 'detected' in window.__state);
  check('Switching tabs preserves the original game session', dapp.url().includes('localhost:5280'));
  const crossSiteCookie = await dapp.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:5290/cookie-echo', { credentials: 'include' });
    return response.json();
  });
  check('Cross-site requests do not leak cookies', crossSiteCookie.cookie === '' && servers.seen.cookieRequests.at(-1)?.cookie === '', JSON.stringify(crossSiteCookie));
  await win.getByTestId('browser-tab-2').click();
  const storedCookies = await second.evaluate(() => document.cookie);
  check('Cross-site responses cannot store cookies', storedCookies.includes('firstParty=seed') && !storedCookies.includes('crossSite=blocked'), storedCookies);
  await win.getByTestId('browser-tab-2').locator('..').getByRole('button', { name: /^Close/ }).click();
  check('Closing a tab returns to one isolated tab', (await win.locator('[data-testid^="browser-tab-"]').count()) === 1);
  await win.getByLabel('Bolt Shield privacy controls').click();
  const trackerSwitch = win.getByTestId('shield-toggle-trackers');
  await trackerSwitch.click();
  const trackerOff = (await trackerSwitch.getAttribute('aria-checked')) === 'false';
  await trackerSwitch.click();
  const trackerOn = (await trackerSwitch.getAttribute('aria-checked')) === 'true';
  check('Tracker shield toggles apply to the active tab', trackerOff && trackerOn);
  await win.getByLabel('Close privacy controls').click();

  // ── Not connected yet, using the spatial panel's normalized click path ──
  const clickPoint = await dapp.locator('#accounts').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: (rect.left + rect.width / 2) / innerWidth, y: (rect.top + rect.height / 2) / innerHeight };
  });
  await win.evaluate((point) => window.boltxrDesktop.browser.input({ type: 'click', ...point }), clickPoint);
  check('Spatial normalized input clicks the Chromium page', JSON.stringify((await lastLog('accounts')).result) === '[]');

  // ── Connect ──
  check('Page view is shown before any request', (await viewVisible()) === true);
  await dapp.click('#connect');
  await approval('connect').waitFor();
  check('Connect opens a connect approval', (await approvalKind()) === 'connect');
  check('Page view is hidden while the approval is shown', (await viewVisible()) === false);
  await win.screenshot({ path: `${SHOTS}/03-approve-connect.png` });
  await footerButton('Connect').click();
  const conn = await lastLog('connect');
  check('BEAM connect() returns the account on chain 9', conn.ok && conn.result.address === ADDRESS && conn.result.chainId === 9, JSON.stringify(conn.result ?? conn.error));
  check('Page view is shown again after approving', (await viewVisible()) === true);

  // ── Verify (sign-in) ──
  await dapp.click('#verify');
  await approval('sign').waitFor();
  check('Verify opens a signature approval', (await approvalKind()) === 'sign');
  const signText = await approval().innerText();
  check('Sign-in message is shown as text, no domain warning', signText.includes('wants you to sign in with your Quai account') && !signText.includes('could sign you in somewhere else'));
  await win.screenshot({ path: `${SHOTS}/04-approve-sign-in.png` });
  await footerButton('Sign').click();
  const ver = await lastLog('verify');
  check('Session service (BEAM logic) verifies the signature', ver.ok && servers.seen.sessions.at(-1)?.ok === true && ver.result.address === ADDRESS, JSON.stringify(ver.error ?? servers.seen.sessions.at(-1)));

  // ── Claim METAKEY ──
  await clearLog();
  await dapp.click('#claim');
  await approval('transaction').waitFor({ timeout: 30000 });
  check('Claim opens a transaction approval', (await approvalKind()) === 'transaction');
  const txText = await approval().innerText();
  check('Transaction approval names the METAKEY claim and contract', txText.includes('Claim your earned METAKEY pass') && txText.includes(PASS));
  await win.screenshot({ path: `${SHOTS}/05-approve-claim.png` });
  await footerButton('Confirm & send').click();
  const claim = await lastLog('claim');
  const sent = servers.seen.decoded.at(-1);
  let decodedCall = null;
  try {
    decodedCall = new Interface(['function claimEarned(uint256 nonce, uint256 deadline, bytes signature)']).decodeFunctionData('claimEarned', sent.data);
  } catch { /* checked below */ }
  check('claimEarned broadcast, receipt status 1', claim.ok && claim.result.status === 1, JSON.stringify(claim.result ?? claim.error));
  check('Node decoded a Quai tx from the account to the pass, chain 9', sent && sent.from === ADDRESS && sent.to === PASS && sent.chainId === '9', JSON.stringify(sent));
  check('Calldata is claimEarned(7, deadline, voucher)', decodedCall && decodedCall[0] === 7n);
  check('Mock node saw no invalid transactions', servers.seen.errors.filter((e) => e.startsWith('invalid')).length === 0, servers.seen.errors.join('; '));

  // ── Review regressions ──
  // 1. Approving one request never approves the next one queued behind it.
  await approval().waitFor({ state: 'detached' });
  await dapp.click('#double');
  await approval('sign').waitFor();
  await footerButton('Sign').click();
  await approval('transaction').waitFor();
  check('Next queued approval starts disarmed (no double-click approval)', await footerButton('Confirm & send').isDisabled());
  await footerButton('Confirm & send').click({ trial: true, timeout: 300 }).catch(() => undefined);
  await win.waitForTimeout(1200);
  check('...and arms itself after a moment', !(await footerButton('Confirm & send').isDisabled()));
  await footerButton('Reject').click();
  const dbl = await lastLog('double');
  check('First signed, second rejected', dbl.ok && dbl.result.first.ok && !dbl.result.second.ok && dbl.result.second.code === 4001, JSON.stringify(dbl.result));
  check('No extra transaction reached the node', servers.seen.decoded.length === 1);

  // 2. Typed data: the type shown is the type signed; unencoded fields are not shown.
  await dapp.click('#typed-mismatch');
  const tm = await lastLog('typed-mismatch');
  check('Mislabelled typed data (primaryType "Login" over a Permit) is refused', !tm.ok && tm.error.code === -32602, JSON.stringify(tm.error));
  await dapp.click('#typed-ok');
  await approval('typed').waitFor();
  const typedText = await approval().innerText();
  check('Typed approval shows Permit fields only, not the extra note', typedText.includes('Permit') && typedText.includes('spender') && !typedText.includes('harmless'));
  await footerButton('Sign').click();
  const tok = await lastLog('typed-ok');
  check('Typed data signature returned', tok.ok && /^0x[0-9a-f]{130}$/i.test(tok.result), JSON.stringify(tok.error ?? ''));

  // ── Phishing-style sign-in for another domain → warning, reject ──
  await approval().waitFor({ state: 'detached' });
  await dapp.click('#sign-foreign');
  await approval('sign').waitFor();
  const foreign = await approval().innerText();
  check('Sign-in for another domain shows a warning', foreign.includes('evil.example') && foreign.includes('could sign you in somewhere else'));
  await win.screenshot({ path: `${SHOTS}/06-domain-warning.png` });
  await footerButton('Reject').click();
  const rej = await lastLog('sign-foreign');
  check('Rejecting returns EIP-1193 user rejection to the page', !rej.ok && (rej.error.code === 'ACTION_REJECTED' || rej.error.code === 'user-rejected' || rej.error.code === 4001 || /declined|rejected|cancelled/i.test(rej.error.message)), JSON.stringify(rej.error));

  // ── Refused and proxied methods ──
  await dapp.click('#eth-sign');
  const es = await lastLog('eth-sign');
  check('eth_sign is refused (4200)', !es.ok && es.error.code === 4200, JSON.stringify(es.error));
  const zeroTransfer = await dapp.evaluate(async () => {
    try {
      const result = await window.pelagus.request({ method: 'quai_sendTransaction', params: [{ to: '0x0000000000000000000000000000000000000000', value: '0x1' }] });
      return { ok: true, result };
    } catch (error) {
      return { ok: false, code: error.code, message: error.message };
    }
  });
  check('Zero-address transfers are refused before an approval', !zeroTransfer.ok && zeroTransfer.code === -32602, JSON.stringify(zeroTransfer));
  if (await approval().isVisible().catch(() => false)) await footerButton('Reject').click();
  await dapp.click('#read');
  const rd = await lastLog('read');
  check('Reads are proxied to the Cyprus-1 node', rd.ok && /^0x[0-9a-f]+$/.test(rd.result) && servers.seen.methods.some((m) => m.method === 'quai_blockNumber' && m.path === '/cyprus1'));
  await dapp.click('#camera');
  const cam = await lastLog('camera');
  check('Camera, location and notifications are denied to pages', cam.ok && cam.result.camera === 'denied' && cam.result.geolocation === 'denied' && cam.result.notifications === 'denied', JSON.stringify(cam.result ?? cam.error));

  // ── Lock / unlock follow the page ──
  await win.getByTestId('account-pill').click(); // lock
  await dapp.waitForFunction(() => window.__events.some((e) => e.event === 'accountsChanged' && e.data.length === 0), null, { timeout: 15000 });
  check('Locking sends accountsChanged([]) to the connected page', true);
  await dapp.click('#accounts');
  check('quai_accounts is empty while locked', JSON.stringify((await lastLog('accounts')).result) === '[]');

  // A request while locked: the approval unlocks first.
  await clearLog();
  await dapp.click('#connect');
  await approval('connect').waitFor();
  check('Request while locked asks for the PIN', await win.locator('.dialog .pin-pad').isVisible());
  await win.screenshot({ path: `${SHOTS}/07-unlock-in-approval.png` });
  await clickPin(PIN);
  await footerButton('Unlock').click();
  await footerButton('Connect').waitFor({ timeout: 30000 });
  await footerButton('Connect').click();
  const reconn = await lastLog('connect');
  check('After unlocking in the approval, connect succeeds', reconn.ok && reconn.result.address === ADDRESS, JSON.stringify(reconn.error ?? ''));
  check('Unlock sends the account back to the page', (await events()).some((e) => e.event === 'accountsChanged' && e.data[0] === ADDRESS));

  // ── Network switch ──
  await approval().waitFor({ state: 'detached' });
  await dapp.click('#switch-orchard');
  await approval('switch').waitFor();
  check('wallet_switchEthereumChain asks first', (await approvalKind()) === 'switch');
  await footerButton('Switch network').click();
  await dapp.waitForFunction(() => window.__events.some((e) => e.event === 'chainChanged' && e.data === 15000), null, { timeout: 15000 });
  check('Switch sends chainChanged(15000) and the selector follows', (await win.locator('#quai-network').inputValue()) === 'orchard');
  await win.locator('#quai-network').selectOption('mainnet');
  await dapp.waitForFunction(() => window.__events.some((e) => e.event === 'chainChanged' && e.data === 9), null, { timeout: 15000 });
  check('Selecting mainnet in the browser sends chainChanged(9)', true);

  // ── Fullscreen ──
  await dapp.click('#fullscreen');
  await win.waitForTimeout(1500);
  check('Page fullscreen makes the window fullscreen', await windowFullscreen());
  const vp = await dapp.evaluate(() => [innerWidth, innerHeight]);
  await dapp.screenshot({ path: `${SHOTS}/08-fullscreen-page.png` }).catch(() => undefined);
  await dapp.evaluate(() => document.exitFullscreen());
  await win.waitForTimeout(1500);
  check('Leaving page fullscreen restores the window', !(await windowFullscreen()), `fullscreen viewport ${vp.join('x')}`);

  // 3. A page that patches exitFullscreen still can't hold the window: Esc wins.
  await dapp.click('#fs-trap');
  await win.waitForTimeout(1500);
  check('Trap page is fullscreen', await windowFullscreen());
  // A real key press (DevTools-injected keys skip Electron's input hooks).
  let realKey = false;
  try {
    execSync('xdotool key Escape', { stdio: 'ignore' });
    realKey = true;
  } catch {
    await dapp.keyboard.press('Escape');
  }
  await win.waitForTimeout(1500);
  check('Esc leaves fullscreen even when the page patched exitFullscreen', !(await windowFullscreen()), realKey ? 'real X key press' : 'injected key');
  check('Browser bar is back after fullscreen', await win.getByLabel('Address').isVisible());
  // The wallet's own exit path ignores the page's patched function too.
  await dapp.click('#fs-trap');
  await win.waitForTimeout(1500);
  await win.evaluate(() => window.boltxrDesktop.browser.command('exit-fullscreen'));
  await win.waitForTimeout(1500);
  check('Wallet exit-fullscreen command beats a patched exitFullscreen', !(await windowFullscreen()));

  // ── Blocked navigation ──
  await dapp.click('#nav-file').catch(() => undefined);
  await win.waitForTimeout(1500);
  check('Navigation to file:// is blocked', dapp.url().startsWith('http://localhost:5280'), dapp.url());

  // ── Navigating away cancels an open approval ──
  await win.getByTestId('account-pill').click(); // lock, then unlock: exercises the vault dialog from the pill
  await win.getByTestId('account-pill').click(); // unlock again
  await clickPin(PIN);
  await win.locator('.dialog').getByRole('button', { name: 'Unlock', exact: true }).click();
  await win.getByTestId('account-pill').filter({ hasText: '0x0056' }).waitFor({ timeout: 30000 });
  await dapp.click('#sign-foreign');
  await approval('sign').waitFor();
  await dapp.evaluate(() => location.reload()).catch(() => undefined);
  await approval().waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined);
  check('A page reload withdraws its pending approval', !(await approval().isVisible().catch(() => false)));

  // 4. A site that keeps asking after rejections is ignored for a while.
  await dapp.waitForFunction(() => window.__state && 'detected' in window.__state);
  await dapp.click('#restore'); // the reload above dropped the page's state
  check('Reloaded page restores its connection silently', (await lastLog('restore')).result?.address === ADDRESS);
  await win.waitForTimeout(61_000); // earlier rejections in this run age out
  let prompted = 0;
  for (let i = 0; i < 4; i++) {
    await dapp.click('#sign-foreign');
    const appeared = await approval('sign').waitFor({ timeout: 4000 }).then(() => true, () => false);
    if (!appeared) break;
    prompted++;
    await footerButton('Reject').click();
    await approval().waitFor({ state: 'detached' });
  }
  check('Cooldown starts within 3 rejections', prompted <= 3, `${prompted} prompts`);
  await clearLog();
  await dapp.click('#sign-foreign');
  const spam = await lastLog('sign-foreign');
  check('After 3 rejections the site is ignored without a prompt', prompted === 3 && !spam.ok && spam.error.code === 'user-rejected' && !(await approval().isVisible()), JSON.stringify(spam.error));

  // 5. "Reject and leave this site".
  await win.waitForTimeout(61_000); // cooldown ends
  await dapp.click('#sign-foreign');
  await approval('sign').waitFor();
  await win.getByRole('button', { name: 'Reject and leave this site' }).click();
  await win.getByTestId('site-overworld').waitFor({ timeout: 15000 });
  check('"Reject and leave" unloads the page and shows the browser home', true);
  await win.getByLabel('Address').fill('localhost:5280/play/nft-1');
  await win.getByLabel('Address').press('Enter');
  await dapp.waitForURL(/localhost:5280/, { timeout: 15000 });

  // ── Disconnect from the home screen ──
  await win.getByRole('button', { name: 'Browser home' }).click();
  await win.screenshot({ path: `${SHOTS}/09-connected-sites.png` });
  await dapp.waitForFunction(() => window.__state && 'detected' in window.__state);
  await win.getByRole('button', { name: /Disconnect/ }).click();
  await win.getByRole('button', { name: /^Resume/ }).click();
  await dapp.click('#accounts');
  check('After Disconnect, quai_accounts is empty', JSON.stringify((await lastLog('accounts')).result) === '[]');

  // ── Spatial WEB uses the same tab offscreen, after the desktop view is hidden ──
  await win.evaluate(() => window.boltxrDesktop.browser.layout({ visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } }));
  const offscreen = await win.evaluate(() => window.boltxrDesktop.browser.capture());
  check('Hiding the native view preserves the spatial capture surface', offscreen?.dataUrl.startsWith('data:image/jpeg;base64,') && offscreen.dataUrl.length > 1000 && offscreen.width > 0 && offscreen.height > 0, offscreen ? `${offscreen.width}×${offscreen.height}` : 'no capture');
  await clearLog();
  const offscreenPoint = await dapp.locator('#accounts').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: (rect.left + rect.width / 2) / innerWidth, y: (rect.top + rect.height / 2) / innerHeight };
  });
  await win.evaluate((point) => window.boltxrDesktop.browser.input({ type: 'click', ...point }), offscreenPoint);
  check('Spatial input works while the native Chromium view is hidden', JSON.stringify((await lastLog('accounts')).result) === '[]');
} catch (e) {
  console.log('ERROR', e.message);
  results.push({ name: 'run completed', ok: false, detail: e.message });
  await win.screenshot({ path: `${SHOTS}/zz-error.png` }).catch(() => undefined);
} finally {
  console.log('node methods seen:', [...new Set(servers.seen.methods.map((m) => m.method))].join(', '));
  if (servers.seen.errors.length) console.log('node errors:', servers.seen.errors.join(' | '));
  await app.close().catch(() => undefined);
  servers.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}
