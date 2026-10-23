/**
 * Test servers:
 *  - a mock Quai Cyprus-1 node that decodes every signed transaction with quais,
 *    recovers the sender and checks it, and records what it saw;
 *  - the "BEAM" test page on http://localhost:5280 with a session endpoint that
 *    verifies the sign-in exactly like BEAM's session service (quais verifyMessage);
 *  - a cross-origin page on http://127.0.0.1:5290 embedded as an iframe.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { QuaiTransaction, verifyMessage, Wallet, solidityPackedKeccak256, getBytes, Interface, keccak256 } from 'quais';

export const PASS = '0x002b2596EcF05C93a31ff916E8b456DF6C77c750';
const PASS_IFACE = new Interface(['function claimEarned(uint256 nonce, uint256 deadline, bytes signature)']);

export function startServers({ nodePort, beamPort, framePort, bundlePath }) {
  const seen = { methods: [], rawTxs: [], decoded: [], sessions: [], errors: [] };
  const receipts = new Map();
  let nonce = 0;
  let block = 1000;

  const node = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-headers', 'content-type');
      if (req.method === 'OPTIONS') return res.end();
      let msg;
      try { msg = JSON.parse(body); } catch { res.statusCode = 400; return res.end(); }
      if (Array.isArray(msg)) { seen.errors.push('batch request'); res.statusCode = 400; return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'batch not supported' } })); }
      const reply = (result) => res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
      const fail = (message) => res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message } }));
      seen.methods.push({ path: req.url, method: msg.method });
      const p = msg.params || [];
      switch (msg.method) {
        case 'quai_chainId': return reply('0x9');
        case 'net_version': return reply('9');
        case 'quai_blockNumber': return reply('0x' + (block++).toString(16));
        case 'quai_getBalance': return reply('0x' + (10n ** 19n).toString(16)); // 10 QUAI
        case 'quai_getTransactionCount': return reply('0x' + nonce.toString(16));
        case 'quai_estimateGas': return reply('0x30d40');
        case 'quai_gasPrice': return reply('0x3b9aca00');
        case 'quai_maxPriorityFeePerGas': return reply('0x0');
        case 'quai_createAccessList': return reply({ accessList: [], gasUsed: '0x30d40' });
        case 'quai_getBlockByNumber': return reply({ hash: '0x' + '11'.repeat(32), number: ['0x' + block.toString(16)], woHeader: { number: '0x' + block.toString(16) }, header: { baseFeePerGas: '0x3b9aca00', number: ['0x1', '0x2', '0x' + block.toString(16)] }, baseFeePerGas: '0x3b9aca00', transactions: [] });
        case 'quai_sendRawTransaction': {
          try {
            const tx = QuaiTransaction.from(p[0]);
            const decoded = { from: tx.from, to: tx.to, value: tx.value.toString(), data: tx.data, chainId: tx.chainId.toString(), nonce: tx.nonce, gasLimit: tx.gasLimit.toString(), hash: tx.hash };
            if (tx.chainId !== 9n) throw new Error('wrong chain id ' + tx.chainId);
            if (!tx.from || !tx.from.startsWith('0x00')) throw new Error('sender not in Cyprus-1: ' + tx.from);
            seen.rawTxs.push(p[0]);
            seen.decoded.push(decoded);
            nonce++;
            receipts.set(tx.hash, { transactionHash: tx.hash, status: '0x1', blockNumber: '0x' + block.toString(16), blockHash: '0x' + '22'.repeat(32), from: tx.from, to: tx.to, gasUsed: '0x5208', cumulativeGasUsed: '0x5208', logs: [], logsBloom: '0x' + '00'.repeat(256), transactionIndex: '0x0', contractAddress: null, type: '0x0', etxs: [], effectiveGasPrice: '0x3b9aca00', outboundEtxs: [] });
            return reply(tx.hash);
          } catch (e) {
            seen.errors.push(String(e.message || e));
            return fail('invalid transaction: ' + (e.message || e));
          }
        }
        case 'quai_getTransactionReceipt': return reply(receipts.get(p[0]) ?? null);
        case 'quai_getTransactionByHash': {
          const r = receipts.get(p[0]);
          return reply(r ? { hash: p[0], blockNumber: r.blockNumber, blockHash: r.blockHash, from: r.from, to: r.to, type: '0x0', nonce: '0x0', value: '0x0', gasLimit: '0x30d40', data: '0x', chainId: '0x9', transactionIndex: '0x0', accessList: [], gasPrice: '0x3b9aca00', minerTip: '0x0' } : null);
        }
        default:
          seen.errors.push('unhandled ' + msg.method);
          return fail('method not handled by mock: ' + msg.method);
      }
    });
  });

  // ── BEAM stand-in ──
  const nonces = new Map();
  const voucherKey = new Wallet('0x' + '42'.repeat(32));
  const page = () => `<!doctype html><html><head><meta charset="utf-8"><title>BEAM test page</title>
<style>body{font:14px system-ui;background:#0b1020;color:#e2e8f0;padding:20px} button{margin:4px;padding:8px 12px} pre{background:#111827;padding:10px;max-height:300px;overflow:auto} iframe{width:100%;height:60px;border:1px solid #334}</style></head>
<body><h1>BEAM · Overworld Overdrive (test page)</h1><div id="detected"></div>
<div><button id="restore">Restore</button><button id="connect">Connect</button><button id="verify">Verify</button><button id="claim">Claim METAKEY</button>
<button id="sign-foreign">Foreign sign-in</button><button id="read">quai_blockNumber</button><button id="accounts">quai_accounts</button><button id="eth-sign">eth_sign</button>
<button id="switch-orchard">Switch Orchard</button><button id="camera">Camera</button><button id="nav-file">Go to file://</button><button id="fullscreen" onclick="document.documentElement.requestFullscreen()">Fullscreen</button>
<button id="double">Sign then send</button><button id="typed-mismatch">Typed (mislabelled)</button><button id="typed-ok">Typed</button><button id="fs-trap">Fullscreen trap</button></div>
<iframe id="game" src="http://127.0.0.1:${framePort}/frame"></iframe>
<pre id="out"></pre>
<script>window.__PASS=${JSON.stringify(PASS)};window.addEventListener('message',e=>{if(e.data&&'frameHasPelagus' in e.data){window.__frame=e.data.frameHasPelagus}})</script><script src="/bundle.js"></script></body></html>`;

  const beam = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      if (req.url === '/' || req.url.startsWith('/play')) { res.setHeader('content-type', 'text/html'); return res.end(page()); }
      if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); return res.end(readFileSync(bundlePath)); }
      if (req.url === '/v1/auth/challenge') {
        const { address } = JSON.parse(body);
        const n = Math.random().toString(16).slice(2);
        const now = new Date();
        const message = [`localhost:${beamPort} wants you to sign in with your Quai account:`, address, '', 'Sign in to BEAM. This proves you control this Quai address; it does not move funds or grant spending rights.', '', `URI: http://localhost:${beamPort}`, 'Version: 1', 'Chain ID: 9', `Nonce: ${n}`, `Issued At: ${now.toISOString()}`, `Expiration Time: ${new Date(+now + 300000).toISOString()}`].join('\n');
        nonces.set(n, message);
        return json({ message, nonce: n, expiresAt: +now + 300000 });
      }
      if (req.url === '/v1/auth/session') {
        const { address, message, signature } = JSON.parse(body);
        const n = /Nonce: (\w+)/.exec(message)?.[1];
        if (!n || nonces.get(n) !== message) return json({ ok: false, error: 'unknown nonce' });
        nonces.delete(n);
        const signer = verifyMessage(message, signature);
        const ok = signer.toLowerCase() === address.toLowerCase();
        seen.sessions.push({ address, signer, ok });
        return json(ok ? { ok: true, address: signer } : { ok: false, error: 'signature mismatch ' + signer });
      }
      if (req.url === '/voucher') {
        const { to } = JSON.parse(body);
        const sig = voucherKey.signingKey.sign(solidityPackedKeccak256(['address', 'uint256'], [to, 7])).serialized;
        return json({ to, nonce: '7', deadline: String(Math.floor(Date.now() / 1000) + 3600), signature: sig });
      }
      res.statusCode = 404;
      res.end('not found');
    });
  });

  const frame = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><body style="color:#94a3b8;font:12px monospace">game iframe · pelagus in frame: <span id="r"></span><script>
      document.getElementById('r').textContent = String(typeof window.pelagus);
      parent.postMessage({ frameHasPelagus: typeof window.pelagus !== 'undefined' }, '*');</script></body>`);
  });

  return Promise.all([
    new Promise((r) => node.listen(nodePort, '127.0.0.1', r)),
    new Promise((r) => beam.listen(beamPort, '127.0.0.1', r)),
    new Promise((r) => frame.listen(framePort, '127.0.0.1', r)),
  ]).then(() => ({
    seen,
    passIface: PASS_IFACE,
    close: () => { node.close(); beam.close(); frame.close(); },
  }));
}

export { keccak256, getBytes };
