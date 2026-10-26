import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './copy-vendor-assets.mjs';
import { startQuestHttps } from './dev-https.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawArgs = process.argv.slice(2);
// Retained as aliases for existing workflows; ordinary `dev` now includes both.
const usb = rawArgs.includes('--usb');
const rest = rawArgs.filter(a => a !== '--quest' && a !== '--usb');
const portArg = rest.find((a, i) => a.startsWith('--port=') || rest[i - 1] === '--port' || rest[i - 1] === '-p');
const port = portArg ? Number(portArg.replace('--port=', '')) || 3000 : 3000;
const httpsPortArg = rest.find(a => a.startsWith('--https-port='));
const httpsPort = httpsPortArg ? Number(httpsPortArg.slice('--https-port='.length)) : port + 1;
if (!Number.isInteger(httpsPort) || httpsPort < 1 || httpsPort > 65535 || httpsPort === port) {
  throw new Error('--https-port must be a valid TCP port different from the HTTP port.');
}

const args = rest.filter(a => !a.startsWith('--https-port=')).map(arg => {
  if (arg === '--host') return '--hostname';
  if (arg.startsWith('--host=')) return `--hostname=${arg.slice('--host='.length)}`;
  return arg;
});
if (!args.some(a => a === '--hostname' || a.startsWith('--hostname='))) args.push('--hostname', '0.0.0.0');
if (!args.some((a, i) => a === '--port' || a === '-p' || a.startsWith('--port=') || args[i - 1] === '--port' || args[i - 1] === '-p')) {
  args.push('--port', String(port));
}

const ips = [...new Set(Object.values(os.networkInterfaces()).flat()
  .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address))];
const httpsServer = await startQuestHttps({ port, httpsPort, lanHosts: ips });
console.log(`\n  Desktop and preview: http://localhost:${port}`);
console.log('  Quest over Wi-Fi (same network, no extra command):');
for (const ip of ips) console.log(`    https://${ip}:${httpsPort}`);
if (!ips.length) console.log('    No LAN address found; USB setup will still be attempted.');
console.log('  The local certificate is self-signed: choose Advanced, then Proceed on the headset.');
console.log('  If Windows asks about network access, allow Node.js on Private networks.\n');

// A connected Quest gets localhost automatically. Poll for reconnects so unplugging
// and re-plugging does not require another pnpm command or a dev-server restart.
const reversed = new Set();
const runAdb = args => process.platform === 'win32'
  ? spawnSync(['adb', ...args].join(' '), { encoding: 'utf8', windowsHide: true, timeout: 3000, shell: true })
  : spawnSync('adb', args, { encoding: 'utf8', windowsHide: true, timeout: 3000 });
const syncAdb = () => {
  const devices = runAdb(['devices']);
  if (devices.error) {
    if (usb && !syncAdb.warned) {
      console.log('  USB auto-setup needs adb on PATH (Android Platform Tools or Meta Quest Developer Hub).');
      syncAdb.warned = true;
    }
    return;
  }
  const current = new Set(String(devices.stdout || '').split(/\r?\n/).slice(1)
    .filter(line => line.trim().endsWith('\tdevice')).map(line => line.split('\t')[0])
    .filter(serial => /^[A-Za-z0-9._:-]+$/.test(serial)));
  for (const serial of current) {
    if (reversed.has(serial)) continue;
    const result = runAdb(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    if (!result.error && result.status === 0) {
      reversed.add(serial);
      console.log(`  Quest USB ready: open http://localhost:${port} in the headset (${serial}).`);
    } else {
      console.log(`  Quest USB auto-setup failed: ${(result.stderr || result.stdout || result.error?.message || '').trim()}`);
      console.log('  Accept USB debugging in the headset; Wi-Fi HTTPS remains available.');
    }
  }
  for (const serial of reversed) if (!current.has(serial)) reversed.delete(serial);
};
let adbTimer = null;
if (process.env.BOLTXR_DEV_NO_ADB !== '1') {
  syncAdb();
  adbTimer = setInterval(syncAdb, 2500);
  adbTimer.unref();
}

const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [next, 'dev', '--webpack', ...args], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  if (adbTimer) clearInterval(adbTimer);
  httpsServer.close();
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
child.on('exit', code => {
  const expected = stopping;
  stop();
  process.exitCode = expected ? 0 : (code ?? 1);
});
