import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-902 Karten-Toggle Smoke: zeigt dass auf /gutachter-finden beide Wege
// (DynamicWizard mit Termin + Mini-Wizard Schnell-Anfrage) ineinandergefuehrt
// sind. Screenshots beider Tabs + ein Mini-Submit-Run.

const SCREENSHOT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  '14.05.2026',
  'prototyp-mini-wizard',
  'screens',
)
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)

let stepIdx = 500
async function shot(page: Page, name: string) {
  stepIdx += 1
  const filename = `${String(stepIdx).padStart(3, '0')}-toggle-${name}.png`
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    fullPage: true,
  })
  console.log(`[SHOT] ${filename}`)
}

async function dismissCookieBanner(page: Page) {
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {})
}

test.describe.configure({ mode: 'serial' })

test('Karte mit Toggle: Default = Termin direkt buchen (DynamicWizard sichtbar)', async ({ page }) => {
  test.setTimeout(60_000)
  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  await page.goto('/gutachter-finden', { waitUntil: 'domcontentloaded' })
  await dismissCookieBanner(page)
  await page.waitForTimeout(3_000)
  await shot(page, '01-default-termin-buchen')

  // Toggle-Buttons vorhanden
  await expect(page.getByRole('button', { name: /termin direkt buchen/i }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /schnell-anfrage/i }).first()).toBeVisible()
})

test('Tab-Wechsel auf Schnell-Anfrage: Mini-Wizard erscheint', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/gutachter-finden', { waitUntil: 'domcontentloaded' })
  await dismissCookieBanner(page)
  await page.waitForTimeout(2_500)

  await page
    .getByRole('button', { name: /schnell-anfrage/i })
    .first()
    .click()
  await page.waitForTimeout(500)
  await shot(page, '02-tab-schnell-anfrage')

  // Mini-Wizard-Felder sichtbar
  await expect(page.locator('#unfallort').first()).toBeVisible()
  await expect(page.locator('#email').first()).toBeVisible()
})

test('Schnell-Anfrage Submit → Magic-Link-Bestaetigung', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/gutachter-finden', { waitUntil: 'domcontentloaded' })
  await dismissCookieBanner(page)
  await page.waitForTimeout(2_500)

  await page
    .getByRole('button', { name: /schnell-anfrage/i })
    .first()
    .click()
  await page.waitForTimeout(500)

  await page.locator('#vorname').first().fill('Anna')
  await page.locator('#unfallort').first().fill('Hauptstraße 12, 50667 Köln')
  await page.locator('#telefon').first().fill('+49 221 1234567')
  await page.locator('#email').first().fill(`smoke-toggle-${RUN_ID}@claimondo.de`)
  const dsgvo = page.locator('[data-slot="checkbox"]').first()
  await dsgvo.scrollIntoViewIfNeeded()
  await dsgvo.click()
  await shot(page, '03-schnell-anfrage-ausgefuellt')

  await page
    .getByRole('button', { name: /login-link erhalten/i })
    .first()
    .click()
  await page.waitForURL(/\/schaden-melden\/link-versendet/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '04-bestaetigung-mail-versendet')

  expect(page.url()).toContain('/schaden-melden/link-versendet')
})
