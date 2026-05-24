import { test, expect, type Page } from '@playwright/test'

/**
 * CMM-63 — kunde-Portal Ownership + Route-Key accept-both (PR1 + PR2-Foundation).
 *
 * Validiert die UI-Wirkung von:
 *   • PR1: Ownership-Konsolidierung auf assertKundeOwnsFall (claim_parties-SSoT) —
 *     der Owner sieht seinen Fall, ein Fremder bekommt notFound (404).
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

test.describe('CMM-63 kunde ownership + accept-both', () => {
  test.skip(!haveIds, 'CMM63_CLAIM_ID + CMM63_FALL_ID env nötig (siehe Datei-Header)')

  test('Owner sieht seinen Fall unter claim_id (neuer Route-Key)', async ({ page }) => {
    await loginAsKunde(page)
    const res = await page.goto(`/kunde/faelle/${CLAIM_ID}`)
    expect(res?.status(), 'claim_id-URL muss 200 liefern (kein 404/notFound)').toBe(200)
    expect(page.url(), 'kein Redirect zurück auf /login').not.toContain('/login')
    await page.screenshot({ path: `playwright-report/cmm63-owner-claimid.png`, fullPage: true })
  })

  test('accept-both: faelle.id (Alt-Bookmark) lädt denselben Fall', async ({ page }) => {
    await loginAsKunde(page)
    const res = await page.goto(`/kunde/faelle/${FALL_ID}`)
    expect(res?.status(), 'faelle.id-URL muss weiterhin 200 liefern (Transition)').toBe(200)
    expect(page.url()).not.toContain('/login')
    await page.screenshot({ path: `playwright-report/cmm63-owner-fallid.png`, fullPage: true })
  })

  test('Fremder Fall → notFound (404), kein Daten-Leak', async ({ page }) => {
    test.skip(!FOREIGN_CLAIM_ID, 'CMM63_FOREIGN_CLAIM_ID env nötig')
    await loginAsKunde(page)
    const res = await page.goto(`/kunde/faelle/${FOREIGN_CLAIM_ID}`)
    expect(res?.status(), 'fremder claim_id muss 404/notFound liefern').toBe(404)
    await page.screenshot({ path: `playwright-report/cmm63-stranger-denied.png`, fullPage: true })
  })
})
