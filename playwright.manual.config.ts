// NICHT COMMITTEN — Lauf-Konfiguration fuer den manuellen Regel-4-Smoke.
//
// Warum es sie braucht: `unfallguide-strecke-prod.spec.ts` steht bewusst in
// MANUELLE_LIVE_SMOKES der playwright.config.ts, damit sie nie in CI laeuft.
// Dieses testIgnore greift AUCH, wenn man die Datei explizit auf der Kommandozeile
// nennt — der Lauf meldet dann "0 tests" statt zu laufen, und ein stiller Skip
// sieht aus wie ein gruener Lauf. Deshalb eine eigene Konfiguration ohne
// testIgnore, die genau diese eine Spec einsammelt.
//
// Kein webServer: das Ziel ist prod (https://claimondo.de), kein lokaler Server.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/unfallguide-strecke-prod.spec.ts',
  timeout: 180_000,
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
