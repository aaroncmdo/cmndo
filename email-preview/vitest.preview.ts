import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Eigene vitest-Config NUR fuer den Email-Preview-Generator. Bewusst getrennt von
// der Haupt-Config (vitest.config.ts, include: src/**/*.{test,spec}) — so wird der
// Generator NIE von `npm test` / CI ausgefuehrt, ist aber ueber `npm run email:preview`
// startbar. Nutzt denselben `@`-Alias wie das Projekt (vite loest TSX + react-email).
export default defineConfig({
  test: {
    include: ['email-preview/generate.preview.tsx'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': resolve(__dirname, '../src') },
  },
})
