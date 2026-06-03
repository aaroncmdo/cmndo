import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// Standalone ESLint (Flat-Config, identisch zu claimondo-v2). Eigener Scope —
// die autounfall-io-App wird NICHT vom claimondo-v2-Lint erfasst (dort via
// tsconfig/eslint exclude ausgeklammert).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])

export default eslintConfig
