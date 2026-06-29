import { defineConfig } from 'vitest/config'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

// Test-Runner fuer den Marketing-Build (vorher keiner vorhanden).
// node-Environment reicht: result-model ist pur; track-event stubt window selbst.
// Scope bewusst auf lib/**/*.test.ts (keine Route-/Component-Tests hier).
export default defineConfig({
  // `@/` -> Marketing-Root, damit Tests alias-importierende Module laden koennen
  // (z.B. lib/feed/validate.ts -> @/lib/content/claimondo-mdx).
  resolve: { alias: { '@': root } },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
