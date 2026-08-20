import { defineConfig, devices } from '@playwright/test'

// KFZ-185: Playwright E2E Smoke-Tests.

export default defineConfig({
  testDir: './tests/e2e',
  // Manuelle Live-Smokes laufen NICHT in CI (`npx playwright test`): sie sind gegen
  // app.claimondo.de strukturell unmoeglich — hardcodeter *.staging.claimondo.de-Host
  // (+ nginx-Basic-Auth), hardcodetes localhost:3001, Abhaengigkeit von dev-only
  // /api/dev/lookup-token (404 auf Prod), oder sie schreiben echte Leads in die Prod-DB.
  // Weiterhin manuell fahrbar via `npx playwright test <datei> --headed` (jede hat einen
  // `// Run:`-Header). Siehe .github/workflows/ci.yml (e2e = nur post-merge).
  testIgnore: [
    'staging-clickthrough.spec.ts',
    'kunde-auth-setup.spec.ts',
    'flows/audit-gutachter-finder-screens.spec.ts',
    'flows/smoke-caldav-status.spec.ts',
    'flows/smoke-caldav-freebusy.spec.ts',
    'flows/smoke-google-bewertungen-staging.spec.ts',
    'flows/smoke-staging-live.spec.ts',
    'flows/smoke-staging-vollstaendig.spec.ts',
    'flows/smoke-staging-sv-termin-verlegen.spec.ts',
    'flows/smoke-cmm65-kunde-realtime.spec.ts',
    'flows/smoke-final-startseite.spec.ts',
    'flows/smoke-final-vollstaendig.spec.ts',
    'flows/smoke-mini-wizard-strecke.spec.ts',
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  // `list` steht bewusst VORNE: html schreibt seinen Report erst am Ende, `github` gibt nur
  // Annotations bei Fehlern aus. Laeuft der Job in ein Timeout (endet als `cancelled`), kam
  // bisher KEINE Zeile ins Log — man sah nicht einmal, bei welchem Test die Suite stand.
  // Belegt am 19. + 20.08.: beide nightly-Laeufe wurden nach 39,5 min gekillt, im Log stand
  // nur "Running 199 tests using 1 worker" und danach nichts mehr bis zum Kill.
  // `list` gibt pro Test eine Zeile -> der Fortschritt ist im Live-Log ablesbar.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['github']] : 'html',
  timeout: 30_000,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Auth setup
    { name: 'admin-setup', testMatch: /admin\.setup\.ts/, teardown: '' },
    { name: 'sv-setup', testMatch: /sv\.setup\.ts/, teardown: '' },

    // Tests
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Dev server (only locally)
  ...(process.env.CI ? {} : {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  }),
})
