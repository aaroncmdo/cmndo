import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Prod-Smoke-Config: laeuft NUR src/**/*.prod-smoke.ts (nicht .test.ts) -> NIE im normalen
// `npm test`/CI. Ausschliesslich via `npm run prod-smoke` (setzt prod-Creds + PROD_SMOKE=1 +
// SIDE_EFFECT_MODE=dry-run). Langer Timeout: das Sandbox-Netz zur prod-DB ist langsam.
export default defineConfig({
  test: {
    include: ['src/**/*.prod-smoke.ts'],
    exclude: ['node_modules', 'tests/e2e/**', '.next/**'],
    environment: 'node',
    testTimeout: 45000,
    hookTimeout: 45000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
