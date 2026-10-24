import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import QRCode from 'qrcode';

const root = process.cwd();
const port = 3127;
const origin = `http://127.0.0.1:${port}`;
const artifacts = path.join(root, 'artifacts', 'wrist-os');
await mkdir(artifacts, { recursive: true });

const server = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk.toString(); });
server.stderr.on('data', chunk => { serverLog += chunk.toString(); });

const stage = message => console.log(`VERIFY: ${message}`);
const watchdog = setTimeout(async () => {
  console.error(`Verification timed out. Server log:\n${serverLog}`);
  await browser?.close();
  if (server.exitCode === null) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { windowsHide: true });
  process.exitCode = 1;
}, 180_000);

let browser;
try {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Dev server exited early:\n${serverLog}`);
    try {
      const response = await fetch(origin);
      if (response.ok) break;
    } catch { /* server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  // Deterministic camera fixture: a real EIP-681 QR in a live canvas stream.
  const qrDataUri = await QRCode.toDataURL('ethereum:0x0000000000000000000000000000000000000001@1', { width: 512, margin: 4 });
  await page.addInitScript(qr => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const context = canvas.getContext('2d');
    const image = new Image();
    const painted = new Promise(resolve => {
      image.onload = () => {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 640, 640);
        context.drawImage(image, 64, 64, 512, 512);
        canvas.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
        const attach = () => document.documentElement?.appendChild(canvas);
        if (!attach()) document.addEventListener('DOMContentLoaded', attach, { once: true });
        resolve(true);
      };
    });
    image.src = qr;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => {
        await painted;
        // Repaint continuously so headless Chromium produces real video frames.
        const stream = canvas.captureStream(12);
        const timer = setInterval(() => {
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, 640, 640);
          context.drawImage(image, 64, 64, 512, 512);
        }, 100);
        stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(timer), { once: true });
        return stream;
      } },
    });
  }, qrDataUri);

  page.setDefaultTimeout(20_000);
  page.on('requestfailed', request => console.log(`VERIFY: request failed ${request.url()}: ${request.failure()?.errorText}`));
  stage('open application');
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  stage('enter spatial experience');
  await page.getByRole('button', { name: /Enter Spatial XR/i }).click();
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(artifacts, '01-watch-home.png'), fullPage: true });
  stage('captured watch home');

  await page.getByRole('button', { name: 'Farm', exact: true }).click();
  await page.waitForTimeout(15000);
  await page.screenshot({ path: path.join(artifacts, '02-yield-radar.png'), fullPage: true });
  stage('captured live farming scanner');

  await page.getByRole('button', { name: 'Pay', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(artifacts, '03-pay-receive.png'), fullPage: true });
  stage('captured payment panel');

  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  stage('opened QR scanner');
  await page.waitForTimeout(15_000);
  await page.screenshot({ path: path.join(artifacts, '04-qr-verified.png'), fullPage: true });
  stage('captured QR scanner result');

  await writeFile(path.join(artifacts, 'runtime.json'), JSON.stringify({ errors, serverLog }, null, 2));
  console.log(JSON.stringify({ screenshots: ['01-watch-home.png', '02-yield-radar.png', '03-pay-receive.png', '04-qr-verified.png'], errors }, null, 2));
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  if (server.exitCode === null) {
    await new Promise(resolve => {
      const killer = spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { windowsHide: true });
      killer.on('exit', resolve);
      killer.on('error', resolve);
    });
  }
}
