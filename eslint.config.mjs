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
    // The native iOS project (see capacitor.config.ts) — App/App/public is
    // `cap sync`'s own copy of `out/`, and the rest is Xcode/Swift project
    // files, neither of which this config has any business linting.
    "ios/**",
  ]),
]);

export default eslintConfig;
