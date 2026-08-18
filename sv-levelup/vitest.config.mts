import { defineConfig } from 'vitest/config'

// Die lib/levelup-Tests sind pure Unit-Tests ohne DB und ohne DOM —
// Node-Environment reicht, kein Setup-File noetig.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/__tests__/**/*.test.ts'],
  },
})
