import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// AAR-289: Vitest läuft auf src/**/*.test.ts + scripts/lib/**/*.test.mjs (pure Libs).
// Nur scripts/lib/ — andere scripts/*.test.mjs (z.B. build-gpt-knowledge) nutzen node:test.
// scripts/test-fixtures/ (Test-Fixtures-Provisioner SP1) hat vitest-.ts-Unit-Tests (mocked db).
// Playwright (tests/e2e/) bleibt über das eigene Script `npm run test:e2e` separat lauffähig.
//
// 23.08.: Die Trennung läuft jetzt über die DATEIENDUNG statt über den Ordner —
// `.spec.ts` = Playwright (Browser), `.test.ts` = vitest (Unit). Sie war faktisch
// schon so (alle 89 Playwright-Dateien heißen `.spec.ts`, es gab keine einzige
// `.test.ts` unter tests/), stand aber nirgends geschrieben.
// Grund für die Änderung: reine Helfer unter `tests/e2e/lib/` (z.B. `ziel.ts`, das
// entscheidet, ob ein Lauf Basic-Auth braucht) sind Unit-testbar, lagen aber im
// pauschalen `tests/e2e/**`-Ausschluss — ein Test dort wäre nie gelaufen und hätte
// wie bestandene Absicherung ausgesehen.
// ⚠ Das Gegenstück steht in playwright.config.ts (`testMatch: '**/*.spec.ts'`).
// Wer hier lockert, muss dort mitziehen, sonst sammeln beide Runner dieselbe Datei ein.
export default defineConfig({
  test: {
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'scripts/lib/**/*.test.mjs',
      'scripts/test-fixtures/**/*.test.ts',
      'tests/e2e/**/*.test.ts',
    ],
    exclude: ['node_modules', 'tests/e2e/**/*.spec.ts', '.next/**'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
