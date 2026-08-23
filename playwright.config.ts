import { defineConfig, devices } from '@playwright/test'

// KFZ-185: Playwright E2E Smoke-Tests.

// Specs, die die MARKETING-Seite (claimondo.de) pruefen, nicht die App (app.claimondo.de).
// Sie laufen im eigenen `marketing`-Projekt mit eigener baseURL — Begruendung + Messwerte
// stehen unten am Projekt. Neue Marketing-Specs hier eintragen, sonst erben sie wieder die
// App-Domain und scheitern mit `<!DOCTYPE html>` statt des erwarteten Inhalts.
const MARKETING_SPECS = [/service-pitch-.*\.spec\.ts/, /doc40-.*\.spec\.ts/]

// Manuelle Live-Smokes laufen NICHT in CI (`npx playwright test`): sie sind gegen
// app.claimondo.de strukturell unmoeglich — hardcodeter *.staging.claimondo.de-Host
// (+ nginx-Basic-Auth), hardcodetes localhost:3001, Abhaengigkeit von dev-only
// /api/dev/lookup-token (404 auf Prod), oder sie schreiben echte Leads in die Prod-DB.
// Weiterhin manuell fahrbar via `npx playwright test <datei> --headed` (jede hat einen
// `// Run:`-Header). Siehe .github/workflows/ci.yml (e2e = nur post-merge).
//
// ⚠ Als Konstante herausgezogen, weil ein `testIgnore` AM PROJEKT das `testIgnore` der
// Top-Level-Config ERSETZT statt es zu ergaenzen — Playwright merged die beiden nicht.
// Wer unten in einem Projekt `testIgnore` setzt, MUSS diese Liste mit hineinspreizen,
// sonst sammelt genau dieses Projekt die 13 manuellen Live-Smokes wieder ein.
// Gemessen 20.08. beim Bau des marketing-Projekts: die Testzahl stieg von 199 auf 221,
// und die 22 zusaetzlichen waren exakt diese Files — inklusive derer, die echte Leads
// in die Prod-DB schreiben. Die Zahl war der einzige Hinweis; gruen war es trotzdem.
// Zeigt PLAYWRIGHT_BASE_URL auf einen entfernten Host (Prod/Staging), ist der lokale
// Dev-Server ueberfluessig — siehe webServer unten.
const ZIEL_URL = process.env.PLAYWRIGHT_BASE_URL ?? ''
const ZIEL_IST_REMOTE = ZIEL_URL !== '' && !/localhost|127\.0\.0\.1/.test(ZIEL_URL)

const MANUELLE_LIVE_SMOKES = [
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
  // 21.08. nachgetragen: erfuellt zwei Kriterien der Liste exakt — Zeile 5 der Spec sagt
  // "Mandanten-End-to-End gegen staging.claimondo.de", sie braucht STAGING_BASIC_PASS
  // (nginx-Basic-Auth) und hat 20 Klick-/Submit-Stellen, schreibt also Daten. Beim Bau
  // dieser Liste uebersehen, weil sie in CI ohnehin skippt: Phase 1 skippt ohne
  // STAGING_BASIC_PASS und `describe.configure({mode:'serial'})` reisst Phase 4 mit.
  // ⚠ Diese Sicherung ist aber eine FEHLENDE ENV-Variable, nicht die Liste — wer
  // STAGING_BASIC_PASS fuer irgendetwas anderes in CI setzt, laesst sie scharf laufen.
  'flows/smoke-vollstrecke.spec.ts',
]

export default defineConfig({
  testDir: './tests/e2e',
  // Playwright sammelt per Default AUCH `*.test.ts` ein. Damit reine Helfer unter
  // `tests/e2e/lib/` einen echten Unit-Test haben koennen, laeuft die Trennung ab
  // 23.08. ueber die Endung: `.spec.ts` = Playwright (Browser), `.test.ts` = vitest.
  // Faktisch war es schon so (alle 89 Playwright-Dateien sind `.spec.ts`), jetzt steht
  // es auch in der Config. Ohne diese Zeile wuerde Playwright `ziel.test.ts` einsammeln
  // und an dessen vitest-Imports scheitern.
  // ⚠ Gegenstueck in vitest.config.ts — beide muessen zusammen geaendert werden.
  testMatch: '**/*.spec.ts',
  testIgnore: MANUELLE_LIVE_SMOKES,
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
      // Marketing-Specs laufen im eigenen Projekt (andere Domain) — hier ausschliessen,
      // sonst liefen sie doppelt und im chromium-Lauf weiter gegen die falsche Seite.
      // Die Live-Smokes MUESSEN mit hinein: dieses `testIgnore` ersetzt das der
      // Top-Level-Config (s. Kommentar an MANUELLE_LIVE_SMOKES).
      testIgnore: [...MANUELLE_LIVE_SMOKES, ...MARKETING_SPECS],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Marketing-Projekt: diese Specs pruefen die MARKETING-Seite (claimondo.de), nicht
      // die App (app.claimondo.de). Sie nutzen relative Pfade (`goto('/')`,
      // `request.get('/llms.txt')`) und erbten damit die App-baseURL aus der CI-ENV.
      //
      // Belegt am 20.08. per A/B gegen dieselben Specs:
      //   service-pitch-llms-txt  gegen app.claimondo.de -> FAILED (bekam <!DOCTYPE html>)
      //                           gegen claimondo.de     -> 4 passed
      //   alle service-pitch-*    gegen claimondo.de     -> 29 passed / 6 failed
      //                           (die 6 sind Text-Drift, s. PR — keine Domain-Sache)
      //   doc40-cards-clickable   app: 1 passed/2 failed | marketing: 2 passed/1 failed
      // Die Ursache ist hart nachweisbar: `app.claimondo.de/llms.txt` liefert HTTP 404 mit
      // text/html, `claimondo.de/llms.txt` HTTP 200 mit text/plain (94 KB).
      //
      // Aufgefallen erst, als der nightly-E2E erstmals durchlief (#5422) — vorher brach die
      // Suite immer vor diesen Specs ab.
      name: 'marketing',
      testMatch: MARKETING_SPECS,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.PLAYWRIGHT_MARKETING_URL ?? 'https://claimondo.de',
      },
    },
  ],

  // Dev server — nur lokal UND nur wenn wirklich gegen localhost getestet wird.
  //
  // Die Bedingung hing bis 21.08. allein an `CI`, nicht daran, WOHIN getestet wird. Damit
  // sabotierte die Config genau den Lauf, den Regel 4 vorschreibt: ein lokaler Prod-Smoke
  // (`PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test …`) startete erst
  // `npm run dev` und starb nach 120 s mit „Timed out waiting 120000ms from
  // config.webServer" — bevor ein einziger Test lief. Der Workaround war, `CI=1`
  // davorzusetzen; das schaltet aber nebenbei Retries/Worker/forbidOnly um und ist damit
  // ein anderer Lauf als der, den man fahren wollte.
  ...(process.env.CI || ZIEL_IST_REMOTE ? {} : {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  }),
})
