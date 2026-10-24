import type { NextConfig } from "next";
import path from "node:path";

const threeRoot = path.resolve(path.dirname(require.resolve("three")), "..");

const nextConfig: NextConfig = {
  output: 'export',
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
    },
  },
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.resolve.alias = {
      ...config.resolve.alias,
      // @pmndrs/xr imports Three's source modules; Three's package exports do
      // not expose that legacy path, so map it explicitly for production builds.
      'three/src': path.join(threeRoot, 'src'),
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
