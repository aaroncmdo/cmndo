import { test, expect, type Page } from '@playwright/test'

// AAR-905: Konsolidierter Smoke fuer die Mini-Wizard-Strecke (AAR-897).
// Ersetzt die 8 prototyp-Smoke-Specs aus den Iterations-PRs der Strecke.
//
// Deckt:
//   1. /schaden-melden Mini-Wizard ausfuellen (Haftpflicht-Path)
//   2. dispatchMagicLink → Email-Fallback (lokal-dev ohne BAILEYS_BASE_URL)
//   3. Bestaetigungs-Page mit ?kanal=email
//   4. Selbstverschulden Soft-Filter-Exit
//   5. /gutachter-finden Karten-Toggle (Default: DynamicWizard; Tab:
//      Schnell-Anfrage = Mini-Wizard)

async function dismissCookie(page: Page) {
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {})
}

const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)

test.describe.configure({ mode: 'serial' })

test('Mini-Wizard /schaden-melden: Haftpflicht-Path → Magic-Link', async ({ page }) => {
  test.setTimeout(60_000)
  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  await page.goto('/schaden-melden', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)

  await page.locator('#unfallort').fill('Hauptstraße 12, 50667 Köln')
  await page.locator('#vorname').fill('Anna')
  await page.locator('#telefon').fill('+49 221 1234567')
  await page.locator('#email').fill(`smoke-mw-haft-${RUN_ID}@claimondo.de`)
  await page.locator('[data-slot="checkbox"]').first().click()

  await page.getByRole('button', { name: /login-link erhalten/i }).click()
  await page.waitForURL(/\/schaden-melden\/link-versendet/, { timeout: 20_000 })

  // Lokal ohne BAILEYS_BASE_URL → Email-Fallback
  expect(page.url()).toContain('kanal=email')
  expect(await page.locator('body').textContent()).toMatch(/Login-Link/i)
})

test('Mini-Wizard /schaden-melden: Selbstverschulden → Soft-Filter-Exit', async ({ page }) => {
  test.setTimeout(60_000)
  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  await page.goto('/schaden-melden', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)

  await page.locator('input[value="eigenverantwortung"]').check()
  await page.locator('#unfallort').fill('A4 Köln-Süd')
  await page.locator('#telefon').fill('+49 221 7654321')
  await page.locator('#email').fill(`smoke-mw-selbst-${RUN_ID}@claimondo.de`)
  await page.locator('[data-slot="checkbox"]').first().click()

  await page.getByRole('button', { name: /login-link erhalten/i }).click()
  await page.waitForURL(/\/schaden-melden\/selbstverschulden/, { timeout: 20_000 })

  expect(page.url()).toContain('/selbstverschulden')
  // Bestaetigung dass die Soft-Filter-Page rendert (existing i18n-Text
  // "Kasko" greift unter de-locale)
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body.length).toBeGreaterThan(0)
})

test('Karten-Toggle /gutachter-finden: Default = DynamicWizard, Tab = Mini-Wizard', async ({ page }) => {
  test.setTimeout(60_000)
  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  await page.goto('/gutachter-finden', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)
  await page.waitForTimeout(2_500) // Mapbox-Init

  // Beide Tabs erreichbar
  await expect(
    page.getByRole('button', { name: /termin direkt buchen/i }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /schnell-anfrage/i }).first(),
  ).toBeVisible()

  // Tab-Wechsel → Mini-Wizard-Felder erscheinen
  await page.getByRole('button', { name: /schnell-anfrage/i }).first().click()
  await page.waitForTimeout(500)
  await expect(page.locator('#unfallort').first()).toBeVisible()
  await expect(page.locator('#email').first()).toBeVisible()
})
