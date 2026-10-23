/**
 * A stand-in for BEAM's wallet flows, built from BEAM's own source:
 * - detection + connect + personal_sign: apps/client/src/wallet/pelagus.ts (QuaiWalletConnection)
 * - sign-in message: packages/shared/src/session/signInMessage.ts
 * - METAKEY claim: quais Contract via the connection's BrowserProvider signer, like useKeyforge.ts
 */
import { Contract } from 'quais';
import { detectQuaiWallet, QuaiWalletConnection } from '@beam-client/wallet/pelagus';
import { QUAI_NETWORKS } from '@beam/shared';

declare global {
  interface Window {
    __log: unknown[];
    __events: { event: string; data: unknown }[];
    __state: Record<string, unknown>;
  }
}

window.__log = [];
window.__events = [];
window.__state = {};

const PASS = (window as unknown as { __PASS: string }).__PASS;
const PASS_ABI = ['function claimEarned(uint256 nonce, uint256 deadline, bytes signature)'];

const out = document.getElementById('out')!;
const log = (entry: Record<string, unknown>) => {
  window.__log.push(entry);
  out.textContent = JSON.stringify(entry, null, 2) + '\n' + out.textContent;
};

const found = detectQuaiWallet();
window.__state.detected = found ? found.name : null;
window.__state.isBoltXR = !!(window as unknown as { pelagus?: { isBoltXR?: boolean } }).pelagus?.isBoltXR;
window.__state.hasEthereum = 'ethereum' in window;
document.getElementById('detected')!.textContent = found ? `Wallet detected: ${found.name}${window.__state.isBoltXR ? ' (Bolt XR)' : ''}` : 'No Quai wallet';

const conn = found ? new QuaiWalletConnection(found.provider, found.name, QUAI_NETWORKS.mainnet) : null;
conn?.subscribe({
  onAccounts: (a) => window.__events.push({ event: 'accountsChanged', data: a }),
  onChain: (c) => window.__events.push({ event: 'chainChanged', data: c }),
});

const errorOf = (e: unknown) => {
  const err = e as { code?: unknown; message?: string; info?: { error?: { code?: number } } };
  return { code: err?.code ?? err?.info?.error?.code, message: err?.message };
};

const run = (id: string, fn: () => Promise<unknown>) => {
  document.getElementById(id)!.addEventListener('click', async () => {
    try {
      const result = await fn();
      log({ action: id, ok: true, result });
    } catch (e) {
      log({ action: id, ok: false, error: errorOf(e) });
    }
  });
};

run('restore', async () => {
  const r = await conn!.restore();
  if (r) window.__state.address = r.address;
  return r;
});
run('connect', async () => {
  const r = await conn!.connect();
  window.__state.address = r.address;
  return r;
});
run('verify', async () => {
  const address = window.__state.address as string;
  const challenge = await (await fetch('/v1/auth/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) })).json();
  const signature = await conn!.signMessage(challenge.message, address);
  const session = await (await fetch('/v1/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, message: challenge.message, signature }) })).json();
  if (!session.ok) throw new Error(session.error);
  window.__state.verified = session.address;
  return session;
});
run('sign-foreign', async () => {
  const address = window.__state.address as string;
  const msg = `evil.example wants you to sign in with your Quai account:\n${address}\n\nSign in.\n\nURI: https://evil.example\nVersion: 1\nChain ID: 9\nNonce: 00\nIssued At: 2026-10-22T00:00:00Z\nExpiration Time: 2026-10-22T00:05:00Z`;
  return conn!.signMessage(msg, address);
});
run('claim', async () => {
  const voucher = await (await fetch('/voucher', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: window.__state.address }) })).json();
  const signer = await conn!.getSigner();
  const pass = new Contract(PASS, PASS_ABI, signer);
  const tx = await (pass as unknown as { claimEarned: (n: bigint, d: bigint, s: string) => Promise<{ hash: string; wait: () => Promise<{ status: number } | null> }> })
    .claimEarned(BigInt(voucher.nonce), BigInt(voucher.deadline), voucher.signature);
  const receipt = await tx.wait();
  window.__state.claimHash = tx.hash;
  return { hash: tx.hash, status: receipt?.status };
});
// A sign-in immediately followed by a transfer: approving the first must not approve the second.
run('double', async () => {
  const address = window.__state.address as string;
  const p = found!.provider;
  const first = p.request({ method: 'personal_sign', params: ['0x' + Array.from(new TextEncoder().encode('first'), (b) => b.toString(16).padStart(2, '0')).join(''), address] });
  const second = p.request({ method: 'quai_sendTransaction', params: [{ from: address, to: '0x002b2596EcF05C93a31ff916E8b456DF6C77c750', value: '0xde0b6b3a7640000' }] });
  const settle = (x: Promise<unknown>) => x.then((r) => ({ ok: true, r }), (e) => ({ ok: false, code: (e as { code?: number }).code }));
  return { first: await settle(first), second: await settle(second) };
});
const typed = (primaryType: string) => ({
  domain: { name: 'BEAM', version: '1', chainId: 9, verifyingContract: '0x002b2596EcF05C93a31ff916E8b456DF6C77c750' },
  types: {
    EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
    Permit: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }],
  },
  primaryType,
  message: { spender: '0x002b2596EcF05C93a31ff916E8b456DF6C77c750', value: '1000', note: 'Just a harmless login' },
});
run('typed-mismatch', async () => found!.provider.request({ method: 'quai_signTypedData_v4', params: [window.__state.address, JSON.stringify(typed('Login'))] }));
run('typed-ok', async () => found!.provider.request({ method: 'quai_signTypedData_v4', params: [window.__state.address, JSON.stringify(typed('Permit'))] }));
run('fs-trap', async () => {
  // A hostile page: no way out through its own exitFullscreen.
  Document.prototype.exitFullscreen = () => Promise.resolve();
  document.exitFullscreen = () => Promise.resolve();
  await document.documentElement.requestFullscreen();
  return 'trapped';
});
run('read', async () => found!.provider.request({ method: 'quai_blockNumber', params: [] }));
run('accounts', async () => found!.provider.request({ method: 'quai_accounts', params: [] }));
run('eth-sign', async () => found!.provider.request({ method: 'eth_sign', params: [window.__state.address, '0x' + '11'.repeat(32)] }));
run('switch-orchard', async () => found!.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x3a98' }] }));
run('nav-file', async () => {
  location.href = 'file:///etc/passwd';
  return 'navigating';
});
run('camera', async () => {
  const camera = await navigator.permissions.query({ name: 'camera' as PermissionName });
  const geo = await navigator.permissions.query({ name: 'geolocation' });
  const notifications = await Notification.requestPermission();
  return { camera: camera.state, geolocation: geo.state, notifications };
});
