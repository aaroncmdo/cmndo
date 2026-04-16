import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// AAR-289: Vitest läuft nur auf src/**/*.test.ts. Playwright (tests/e2e/) bleibt
// über das eigene Script `npm run test:e2e` separat lauffähig.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'tests/e2e/**', '.next/**'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
