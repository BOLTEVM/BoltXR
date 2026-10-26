import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Electron-builder output and third-party runtime assets copied from node_modules
    "dist/**",
    "public/vendor/**",
    "e2e/.out/**",
    // the private watch module: vendored b3js destruction FX (linted in b3js) and the holder
    // server (a Cloudflare Worker with its own toolchain)
    "private/iced-out/destruct/fx/**",
    "private/iced-out/destruct/ConstructionCatalog.ts",
    "private/iced-out/export/rig/**",
    "private/iced-out/server/**",
    // stale copies of moved code, until scripts in the private repo clear them
    "_to_delete/**",
    "lib/watch/**",
    "lib/destruct/**",
  ]),
  {
    // Electron's main and preload scripts run as CommonJS in Node.
    files: ["electron/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
