/**
 * Bundles the test page from BEAM's own wallet code. BEAM is expected next to
 * this repo (../beam), or wherever BEAM_DIR points.
 */
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wallet = path.resolve(here, '..');
export const beamDir = path.resolve(process.env.BEAM_DIR || path.join(wallet, '..', 'beam'));

export async function buildDapp() {
  const pelagus = path.join(beamDir, 'apps/client/src/wallet/pelagus.ts');
  const quai = path.join(beamDir, 'packages/shared/src/chain/quai.ts');
  if (!existsSync(pelagus) || !existsSync(quai)) {
    throw new Error(`BEAM sources not found under ${beamDir} (set BEAM_DIR)`);
  }
  const outfile = path.join(here, '.out', 'bundle.js');
  await build({
    entryPoints: [path.join(here, 'dapp/main.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile,
    nodePaths: [path.join(wallet, 'node_modules')],
    alias: {
      '@beam-client': path.join(beamDir, 'apps/client/src'),
      // pelagus.ts only needs the Quai address helpers from @beam/shared.
      '@beam/shared': quai,
    },
    logLevel: 'warning',
  });
  return outfile;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(await buildDapp());
}
