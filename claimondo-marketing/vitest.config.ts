import { defineConfig } from 'vitest/config'

// Test-Runner fuer den Marketing-Build (vorher keiner vorhanden).
// node-Environment reicht: result-model ist pur; track-event stubt window selbst.
// Scope bewusst auf lib/**/*.test.ts (keine Route-/Component-Tests hier).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
