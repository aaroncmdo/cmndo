import { defineConfig } from 'vitest/config'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

// Test-Runner fuer den Marketing-Build (vorher keiner vorhanden).
// node-Environment reicht: result-model ist pur; track-event stubt window selbst.
// Scope bewusst eng (keine Route-/Component-Tests hier):
//   lib/**   — pure Logik
//   i18n/**  — der Guard fuer CLIENT_NAMESPACES. Der Namespace-Filter im
//              NextIntlClientProvider spart auf jeder Seite ~200 KB HTML; faellt
//              ein neu genutzter Namespace aus der Liste, zeigt die UI zur Laufzeit
//              den rohen Key. Ohne diesen Eintrag laege der Guard hier und liefe nie.
export default defineConfig({
  // `@/` -> Marketing-Root, damit Tests alias-importierende Module laden koennen
  // (z.B. lib/feed/validate.ts -> @/lib/content/claimondo-mdx).
  resolve: { alias: { '@': root } },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'i18n/**/*.test.ts'],
  },
})
