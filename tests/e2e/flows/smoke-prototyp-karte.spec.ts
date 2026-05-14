import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-902 Prototyp Karte: Mini-Wizard auf /gutachter-finden Sidebar.
// Bestaetigt: Mapbox-Karte rendert, Mini-Wizard-Form ist in der Sidebar /
// Bottom-Sheet ansprechbar, Submit fuehrt zur Bestaetigungs-Page.

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

let stepIdx = 100
async function shot(page: Page, name: string) {
  stepIdx += 1
  const filename = `${String(stepIdx).padStart(3, '0')}-karte-${name}.png`
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    fullPage: true,
  })
  console.log(`[SHOT] ${filename}`)
}

test.describe.configure({ mode: 'serial' })

test('Prototyp Karte: Mini-Wizard auf /gutachter-finden → Magic-Link', async ({ page }) => {
  test.setTimeout(60_000)

  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[BROWSER error] ${m.text()}`)
  })

  await page.goto('/gutachter-finden', { waitUntil: 'domcontentloaded' })
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {})

  // Map braucht ein bisschen Zeit fuer Init + Tiles.
  await page.waitForTimeout(3_000)
  await shot(page, 'karte-mit-wizard')

  // Mini-Wizard rendert zweimal (Desktop-Sidebar + Mobile-Bottom-Sheet),
  // wir nehmen jeweils das erste sichtbare Vorkommen.
  await page.locator('#unfallort').first().fill('Hauptstraße 12, 50667 Köln')
  await page.locator('#email').first().fill(`smoke-karte-${RUN_ID}@claimondo.de`)
  await page.locator('#telefon').first().fill('+49 221 9876543')
  const dsgvo = page.locator('[data-slot="checkbox"]').first()
  await dsgvo.scrollIntoViewIfNeeded()
  await dsgvo.click()

  await shot(page, 'karte-wizard-ausgefuellt')

  await page
    .getByRole('button', { name: /login-link erhalten/i })
    .first()
    .click()

  await page.waitForURL(/\/schaden-melden\/link-versendet/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, 'karte-redirect-bestaetigung')

  expect(page.url()).toContain('/schaden-melden/link-versendet')
})
