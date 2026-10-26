import type { NextConfig } from "next";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const threeRoot = path.resolve(path.dirname(require.resolve("three")), "..");

// The Iced-Out XR watches live in a private repository checked out at private/iced-out.
// Without it the app builds with lib/iced-out/missing.ts: the classic watch on every wrist and
// studio photos in place of the 3D try-on. Release builds set ICED_OUT_REQUIRED=1 so a missing
// checkout fails the build instead of shipping without the watches.
const icedOutPrivate = path.join(__dirname, "private", "iced-out", "index.ts");
const hasIcedOut = fs.existsSync(icedOutPrivate);
if (!hasIcedOut && process.env.ICED_OUT_REQUIRED === "1") {
  throw new Error("ICED_OUT_REQUIRED=1 but private/iced-out is missing: clone the private watch repository there first.");
}
const icedOutEntry = hasIcedOut ? icedOutPrivate : path.join(__dirname, "lib", "iced-out", "missing.ts");
console.log(`Iced-Out XR watches: ${hasIcedOut ? "private module included" : "not in this build (private/iced-out not found)"}`);

// A headset on the same Wi-Fi loads the dev server by this machine's LAN address. Next 16 blocks
// dev assets for origins it does not know, which leaves a blank page in the Quest browser, so list
// this machine's own addresses (dev server only; the static export ignores this).
const lanHosts = Object.values(os.networkInterfaces()).flat()
  .filter(a => a && a.family === "IPv4" && !a.internal).map(a => a!.address);

const nextConfig: NextConfig = {
  output: 'export',
  allowedDevOrigins: [...lanHosts, "*.local"],
  outputFileTracingRoot: __dirname,
  images: {
    unoptimized: true,
  },
  /* config options here */
  reactCompiler: true,
  turbopack: {
    root: __dirname,
    resolveAlias: {
      'three/src': path.join(threeRoot, 'src'),
      '@iced-out/watch': hasIcedOut ? './private/iced-out/index.ts' : './lib/iced-out/missing.ts',
    },
  },
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.resolve.alias = {
      ...config.resolve.alias,
      // @pmndrs/xr imports Three's source modules; Three's package exports do
      // not expose that legacy path, so map it explicitly for production builds.
      'three/src': path.join(threeRoot, 'src'),
      '@iced-out/watch$': icedOutEntry,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
      process: require.resolve('process/browser'),
    };
    return config;
  },
};

export default nextConfig;
