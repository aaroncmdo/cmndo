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
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'html',
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

  // Dev server (only locally). Skip für den Prod-Golden-Path (RUN_GOLDEN_PATH_DEEP): der fährt
  // gegen app.claimondo.de (absolute URLs), braucht keinen lokalen Server — und `npm run dev`
  // scheitert im Worktree an unvollständigem node_modules (otel/sentry MODULE_NOT_FOUND).
  ...((process.env.CI || process.env.RUN_GOLDEN_PATH_DEEP) ? {} : {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  }),
})
