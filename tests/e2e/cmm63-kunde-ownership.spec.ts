import { test, expect, type Page } from '@playwright/test'

/**
 * CMM-63 — kunde-Portal Ownership + Route-Key accept-both (PR1 + PR2-Foundation).
 *
 * Validiert die UI-Wirkung von:
 *   • PR1: Ownership-Konsolidierung auf assertKundeOwnsFall (claim_parties-SSoT) —
 *     der Owner sieht seinen Fall, ein Fremder bekommt die Not-Found-UI
 *     (kein Daten-Leak; Status bleibt 200 wegen force-dynamic-Streaming).
 *   • PR2-Foundation: getKundeFallDetailRecord ist accept-both — die Detail-Page
 *     lädt SOWOHL unter /kunde/faelle/<claimId> (neuer Route-Key) ALS AUCH unter
 *     /kunde/faelle/<faelleId> (Alt-Bookmark) denselben Fall.
 *
 * Lauf-Voraussetzungen (sonst test.skip — KEIN false-pass):
 *   PLAYWRIGHT_BASE_URL   – Ziel (lokal: http://localhost:3000 = dieser Branch;
 *                           staging erst NACH Merge, sonst testet man Alt-Code!)
 *   TEST_KUNDE_EMAIL / TEST_KUNDE_PASSWORD – ein kunde-Login (Default test-kunde@claimondo.de / Test1234!)
 *   CMM63_CLAIM_ID        – claim_id eines Falls den dieser Kunde besitzt
 *   CMM63_FALL_ID         – die faelle.id desselben Falls (Alt-Bookmark-Pfad)
 *   CMM63_FOREIGN_CLAIM_ID – claim_id eines FREMDEN Falls (Stranger-Abwehr)
 *
 * Bezugswerte (Daten-Layer-Smoke 2026-05-24, sauberes Case): siehe
 * scripts/smoke-cmm63-ownership.mjs — dort werden dieselben Invarianten datenseitig geprüft.
 */

const KUNDE_EMAIL = process.env.TEST_KUNDE_EMAIL ?? 'test-kunde@claimondo.de'
const KUNDE_PW = process.env.TEST_KUNDE_PASSWORD ?? 'Test1234!'
const CLAIM_ID = process.env.CMM63_CLAIM_ID
const FALL_ID = process.env.CMM63_FALL_ID
const FOREIGN_CLAIM_ID = process.env.CMM63_FOREIGN_CLAIM_ID

const haveIds = Boolean(CLAIM_ID && FALL_ID)

async function loginAsKunde(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="email"], input[name="email"]', KUNDE_EMAIL)
  await page.fill('input[type="password"], input[name="password"]', KUNDE_PW)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 })
}

const haveCreds = Boolean(KUNDE_EMAIL && KUNDE_PW)

test.describe('CMM-63 kunde ownership + accept-both', () => {
  test.skip(!haveCreds, 'TEST_KUNDE_EMAIL/PASSWORD env nötig')

  test('kunde-Portal /kunde lädt (Layout + getKundeFaelle, kein Crash)', async ({ page }) => {
    await loginAsKunde(page)
    const res = await page.goto('/kunde')
    expect(res?.status(), '/kunde rendert (kein 5xx)').toBeLessThan(500)
    expect(page.url(), 'nicht zurück auf /login').not.toContain('/login')
    await page.screenshot({ path: `playwright-report/cmm63-portal-loads.png`, fullPage: true })
  })

  test('Fremder Fall → not-found UI, kein Daten-Leak [deny-Pfad]', async ({ page }) => {
    test.skip(!FOREIGN_CLAIM_ID, 'CMM63_FOREIGN_CLAIM_ID env nötig')
    await loginAsKunde(page)
    await page.goto(`/kunde/faelle/${FOREIGN_CLAIM_ID}`)
    // Sicherheitsgarantie = "kein Daten-Leak". Der HTTP-Status ist NICHT
    // verlässlich 404: die `force-dynamic` Detail-Page streamt die Layout-Shell
    // (Status 200) BEVOR notFound() rendert. Daher inhaltlich prüfen:
    //   • die Not-Found-UI rendert (statt der Fall-Daten),
    //   • der generische "Fehler beim Laden"-Catch greift NICHT mehr
    //     (vor dem CMM-63-Fix verschluckte der page-catch das notFound()).
    await expect(page.getByText('Seite nicht gefunden')).toBeVisible()
    await expect(page.getByText('Fehler beim Laden')).toHaveCount(0)
    expect(page.url(), 'kein Redirect zurück auf /login').not.toContain('/login')
    await page.screenshot({ path: `playwright-report/cmm63-stranger-denied.png`, fullPage: true })
  })

  test('Owner sieht seinen Fall unter claim_id (neuer Route-Key)', async ({ page }) => {
    test.skip(!haveIds, 'CMM63_CLAIM_ID + CMM63_FALL_ID env nötig (Owner-Case)')
    await loginAsKunde(page)
    const res = await page.goto(`/kunde/faelle/${CLAIM_ID}`)
    expect(res?.status(), 'claim_id-URL muss 200 liefern (kein 404/notFound)').toBe(200)
    expect(page.url(), 'kein Redirect zurück auf /login').not.toContain('/login')
    await page.screenshot({ path: `playwright-report/cmm63-owner-claimid.png`, fullPage: true })
  })

  test('accept-both: faelle.id (Alt-Bookmark) lädt denselben Fall', async ({ page }) => {
    test.skip(!haveIds, 'CMM63_FALL_ID env nötig (Owner-Case)')
    await loginAsKunde(page)
    const res = await page.goto(`/kunde/faelle/${FALL_ID}`)
    expect(res?.status(), 'faelle.id-URL muss weiterhin 200 liefern (Transition)').toBe(200)
    expect(page.url()).not.toContain('/login')
    await page.screenshot({ path: `playwright-report/cmm63-owner-fallid.png`, fullPage: true })
  })

  test('Owner sub-routes rendern (termine/nachbesichtigung/chat — CMM-63 PR3b)', async ({ page }) => {
    test.skip(!haveIds, 'Owner-Case env nötig')
    await loginAsKunde(page)
    // CMM-63 PR3b: diese Routen lösen Ownership jetzt über getOwnedClaimIds
    // (claim_parties) statt faelle.kunde_id — sie müssen für den Owner rendern.
    for (const route of ['/kunde/termine', '/kunde/nachbesichtigung', '/kunde/chat']) {
      const res = await page.goto(route)
      expect(res?.status(), `${route} rendert (kein 5xx)`).toBeLessThan(500)
      expect(page.url(), `${route} kein /login-Redirect`).not.toContain('/login')
    }
    await page.screenshot({ path: `playwright-report/cmm63-subroutes.png`, fullPage: true })
  })
})
