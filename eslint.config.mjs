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
    // autounfall.io = eigenstaendiges Next-Projekt (Property 2, STANDALONE) im
    // Unterordner autounfall-io/. Hat eigenen ESLint/tsconfig/Build — darf NICHT
    // vom claimondo-v2-Lint/Typecheck erfasst werden (eigenes Token-/Brand-System).
    "autounfall-io/**",
  ]),
]);

export default eslintConfig;
