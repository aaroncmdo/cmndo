import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// AAR-289: Vitest läuft auf src/**/*.test.ts + scripts/lib/**/*.test.mjs (pure Libs).
// Nur scripts/lib/ — andere scripts/*.test.mjs (z.B. build-gpt-knowledge) nutzen node:test.
// Playwright (tests/e2e/) bleibt über das eigene Script `npm run test:e2e` separat lauffähig.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/lib/**/*.test.mjs'],
    exclude: ['node_modules', 'tests/e2e/**', '.next/**'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
