/**
 * Resolves app:// requests to files in the Next.js static export (out/).
 * Kept free of Electron APIs so it can be tested with plain Node.
 */
const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.binarypb': 'application/octet-stream',
};

const mimeFor = (file) => MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

const isFile = (candidate) => {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
};

/**
 * Map a request URL to a file inside `root`, or null if it does not exist
 * or would escape the root (path traversal).
 */
function resolveStaticFile(root, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;

  const base = path.resolve(root);
  const target = path.resolve(base, '.' + pathname);
  if (target !== base && !target.startsWith(base + path.sep)) return null;

  // Next.js export layout: "/" -> index.html, "/route" -> route.html or route/index.html
  const candidates = [target, path.join(target, 'index.html')];
  if (!path.extname(target)) candidates.push(`${target}.html`);
  return candidates.find(isFile) || null;
}

module.exports = { resolveStaticFile, mimeFor };
