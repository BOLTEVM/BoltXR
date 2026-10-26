import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const port = 3200 + (process.pid % 1000);
const fixture = mkdtempSync(path.join(os.tmpdir(), 'boltxr-adb-'));
const adbLog = path.join(fixture, 'adb.log');
if (process.platform === 'win32') {
  writeFileSync(path.join(fixture, 'adb.cmd'), `@echo off\r\nif "%1"=="devices" (echo List of devices attached& echo QUEST123	device) else (echo %*>> "%BOLTXR_ADB_LOG%")\r\n`);
} else {
  const adb = path.join(fixture, 'adb');
  writeFileSync(adb, '#!/bin/sh\nif [ "$1" = "devices" ]; then printf "List of devices attached\\nQUEST123\\tdevice\\n"; else printf "%s\\n" "$*" >> "$BOLTXR_ADB_LOG"; fi\n');
  chmodSync(adb, 0o755);
}
const child = spawn(process.execPath, ['scripts/dev.mjs', '--port', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, BOLTXR_ADB_LOG: adbLog, PATH: `${fixture}${path.delimiter}${process.env.PATH || ''}` },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let output = '';
let browser;
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });

const stop = () => new Promise(resolve => {
  if (child.exitCode !== null) return resolve();
  const killer = process.platform === 'win32'
    ? spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    : child;
  if (process.platform !== 'win32') child.kill('SIGTERM');
  killer.once('exit', resolve);
  killer.once('error', resolve);
});
const getHttps = url => new Promise((resolve, reject) => {
  const request = https.get(url, { rejectUnauthorized: false, timeout: 2500 }, response => {
    let body = '';
    response.on('data', chunk => { body += chunk; });
    response.on('end', () => resolve({ status: response.statusCode, body }));
  });
  request.on('timeout', () => request.destroy(new Error('HTTPS endpoint timed out')));
  request.on('error', reject);
});

try {
  let desktop;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Dev server exited early:\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}`);
      if (response.ok) {
        desktop = { status: response.status, body: await response.text() };
        break;
      }
    } catch { /* Next is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!desktop?.body.includes('<html')) throw new Error(`Desktop HTTP localhost did not start:\n${output}`);
  console.log(`PASS desktop HTTP localhost: ${desktop.status}`);

  const quest = await getHttps(`https://127.0.0.1:${port + 1}`);
  if (quest.status !== 200 || !quest.body.includes('<html')) throw new Error(`Quest HTTPS returned ${quest.status}`);
  console.log(`PASS Quest HTTPS on the same default launch: ${quest.status}`);

  const lanHost = Object.values(os.networkInterfaces()).flat()
    .find(address => address && address.family === 'IPv4' && !address.internal)?.address;
  if (lanHost) {
    const lan = await getHttps(`https://${lanHost}:${port + 1}`);
    if (lan.status !== 200 || !lan.body.includes('<html')) throw new Error(`LAN HTTPS returned ${lan.status}`);
    console.log(`PASS Quest LAN origin is accepted: ${lanHost}`);
  }

  const adbDeadline = Date.now() + 6000;
  while ((!existsSync(adbLog) || !readFileSync(adbLog, 'utf8').includes(`reverse tcp:${port} tcp:${port}`)) && Date.now() < adbDeadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!existsSync(adbLog) || !readFileSync(adbLog, 'utf8').includes(`reverse tcp:${port} tcp:${port}`)) {
    throw new Error(`Default launch did not map the simulated Quest over USB:\n${output}`);
  }
  console.log('PASS default launch automatically maps Quest USB localhost');

  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const hmrSocket = page.waitForEvent('websocket', { predicate: socket => socket.url().includes('/_next/webpack-hmr'), timeout: 15000 });
  await page.goto(`https://127.0.0.1:${port + 1}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const socket = await hmrSocket;
  await socket.waitForEvent('socketopen', { timeout: 10000 });
  console.log('PASS HTTPS companion preserves development HMR WebSockets');
  await page.getByRole('button', { name: /Enter Spatial XR/i }).waitFor({ timeout: 30000 });
  const runtime = await page.evaluate(() => ({ secure: isSecureContext, xr: !!navigator.xr }));
  if (!runtime.secure || !runtime.xr) throw new Error(`Secure WebXR runtime unavailable: ${JSON.stringify(runtime)}`);
  console.log(`PASS loaded app has secure context and WebXR API: ${JSON.stringify(runtime)}`);
} catch (error) {
  console.error(`FAIL default dev is not seamless for Quest: ${error.message}`);
  const diagnostics = output.split(/\r?\n/).filter(line => line.includes('[DEBUG-'));
  if (diagnostics.length) console.error(diagnostics.join('\n'));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stop();
  rmSync(fixture, { recursive: true, force: true });
}
