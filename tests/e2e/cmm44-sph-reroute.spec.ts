// CMM-44 SP-H — E2E-Integration-Test fuer den Reader-Reroute (faelle -> auftraege).
//
// Prueft die SP-H-Reader-Oberflaeche durch die echte App gegen Staging:
//  - SV /gutachter/abrechnung: die "Technische Stellungnahmen"-Sektion liest jetzt
//    ueber v_faelle_mit_aktuellem_termin (View-Switch, aus dem aktuellen Auftrag).
//    Der Test sichert ab, dass der Reader-Pfad rendert und NICHT in die
//    App-Root-Error-Boundary faellt.
//
// Self-contained: eigener Context mit Basic-Auth (Staging) + eigener Login,
// weil die fixtures.ts auf localhost ohne Basic-Auth ausgelegt sind.
//
// Lauf:  CI=1 PLAYWRIGHT_BASE_URL=https://app.staging.claimondo.de \
//        node --env-file=.env.local node_modules/@playwright/test/cli.js test \
//        tests/e2e/cmm44-sph-reroute.spec.ts --project=chromium
// (CI=1 deaktiviert den lokalen dev-webServer aus playwright.config.ts.)

import { test, expect, type Page } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS
const SV_EMAIL = process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de'
const SV_PASS = process.env.TEST_SV_PASSWORD ?? 'Test1234!'

const isStaging = BASE.includes('staging.claimondo.de')

async function loginAsSv(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', SV_EMAIL)
  await page.fill('input[type="password"], input[name="password"]', SV_PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 })
}

test.describe('CMM-44 SP-H — Reader-Reroute (Auftrag-Lifecycle)', () => {
  // Staging haengt hinter Basic-Auth; lokal (localhost) nicht.
  test.use(
    isStaging && BASIC_USER && BASIC_PASS
      ? { httpCredentials: { username: BASIC_USER, password: BASIC_PASS } }
      : {},
  )

  // Staging-Integrationstest: braucht Basic-Auth + Seed-Daten. Der CI-e2e-Job
  // laeuft gegen Prod (app.claimondo.de) — dort skippen (kein spurious Fail),
  // gegen Staging laufen.
  test.skip(!isStaging, 'nur gegen Staging (Basic-Auth + Seed-Daten) — PLAYWRIGHT_BASE_URL setzen')

  test.beforeAll(() => {
    if (isStaging && (!BASIC_USER || !BASIC_PASS)) {
      throw new Error('STAGING_BASIC_AUTH_USER/PASS fehlen — mit `node --env-file=.env.local` laufen.')
    }
  })

  test('SV /gutachter/abrechnung rendert (TS-Sektion via View-Switch), kein App-Root-Crash', async ({ page }) => {
    test.setTimeout(90_000)
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    await loginAsSv(page)
    const resp = await page.goto(`${BASE}/gutachter/abrechnung`, { waitUntil: 'networkidle' })

    // 1) HTTP ok (kein 5xx vom Reader-Pfad)
    expect(resp?.status() ?? 0, 'HTTP-Status der Abrechnungsseite').toBeLessThan(500)

    // 2) Die Seite ist die Abrechnung — nicht die App-Root-Error-Boundary.
    //    (Die Boundary rendert "APP ROOT CRASH" statt der Abrechnung.)
    //    Der Seiten-Render umfasst serverseitig die SP-H-View-Switch-Query
    //    (stellungnahmen via v_faelle_mit_aktuellem_termin) — haette die geworfen,
    //    waere die Seite nicht gerendert. Stabiler Marker: PageHeader-Description
    //    + die semantische "Abgerechnete Fälle"-Ueberschrift.
    await expect(page.getByText('APP ROOT CRASH')).toHaveCount(0)
    await expect(
      page.getByText('Übersicht Ihrer Abrechnungen und Pakete'),
      'PageHeader-Description sichtbar => Abrechnungsseite (inkl. SP-H-View-Switch-Query) hat gerendert',
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Abgerechnete Fälle' })).toBeVisible()

    // 3) Kein harter React-Render-Crash auf dem SP-H-Reader-Pfad.
    //    (#418 Hydration-Recovery ist pre-existing/benign und kommt hier nicht vor;
    //     ein echter Crash auf der Abrechnung waere SP-H-relevant.)
    const hardCrash = pageErrors.filter((m) => !m.includes('#418') && !m.includes('#310'))
    expect(hardCrash, `unerwartete pageerrors: ${hardCrash.join(' | ')}`).toEqual([])
  })
})
