/**
 * Copies runtime assets that must be served same-origin into public/vendor.
 *
 * MediaPipe Hands loads its WASM runtime, JS loader and model files at
 * runtime. Serving them from the app (instead of a CDN) keeps third-party
 * code out of the wallet page, pins them to the lockfile version, and makes
 * hand tracking work offline and in the Electron build.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

const packageDir = dirname(require.resolve('@mediapipe/hands/package.json'));
const target = join(root, 'public', 'vendor', 'mediapipe', 'hands');
const skip = new Set(['package.json', 'README.md', 'index.d.ts']);

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

let copied = 0;
for (const file of readdirSync(packageDir)) {
  if (skip.has(file)) continue;
  cpSync(join(packageDir, file), join(target, file));
  copied++;
}

if (!existsSync(join(target, 'hands.js')) || copied === 0) {
  console.error('[vendor] MediaPipe Hands assets are missing — run your package manager install first.');
  process.exit(1);
}
console.log(`[vendor] MediaPipe Hands: ${copied} files -> public/vendor/mediapipe/hands`);
