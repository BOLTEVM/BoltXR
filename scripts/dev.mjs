import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './copy-vendor-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).map(arg => {
  if (arg === '--host') return '--hostname';
  if (arg.startsWith('--host=')) return `--hostname=${arg.slice('--host='.length)}`;
  return arg;
});
const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [next, 'dev', '--webpack', ...args], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});

let stopping = false;
const stop = () => {
  if (stopping || child.exitCode !== null) return;
  stopping = true;
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
  process.exitCode = stopping ? 0 : (code ?? 1);
});
