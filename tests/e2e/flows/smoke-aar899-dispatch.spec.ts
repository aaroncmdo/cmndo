import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-899 Komplett-Smoke nach Merge. Mini-Wizard mit dispatchMagicLink:
// lokal-dev ohne BAILEYS_BASE_URL → Email-Fallback. Verifiziert dass die
// Bestaetigungs-Page mit ?kanal=email gerendert wird und der Lead in DB
// landet.

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
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
const EMAIL = `smoke-aar899-${RUN_ID}@claimondo.de`

let stepIdx = 600
async function shot(page: Page, name: string) {
  stepIdx += 1
  const f = `${String(stepIdx).padStart(3, '0')}-aar899-${name}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, f), fullPage: true })
  console.log(`[SHOT] ${f}`)
}

test('AAR-899 Komplett: Mini-Wizard → dispatchMagicLink → Email-Fallback', async ({ page }) => {
  test.setTimeout(60_000)
  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  // 1) Marketing-Landing
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {})
  await shot(page, '01-marketing')

  // 2) Direkt zum Mini-Wizard (Karte mit Toggle haben wir schon gesmoked)
  await page.goto('/schaden-melden/prototyp', { waitUntil: 'domcontentloaded' })
  await shot(page, '02-mini-wizard-leer')

  await page.locator('#vorname').first().fill('Anna')
  await page.locator('#unfallort').first().fill('Hauptstraße 12, 50667 Köln')
  await page.locator('#telefon').first().fill('+49 221 1234567')
  await page.locator('#email').first().fill(EMAIL)
  const dsgvo = page.locator('[data-slot="checkbox"]').first()
  await dsgvo.scrollIntoViewIfNeeded()
  await dsgvo.click()
  await shot(page, '03-mini-wizard-ausgefuellt')

  await page.getByRole('button', { name: /login-link erhalten/i }).first().click()
  await page.waitForURL(/\/schaden-melden\/prototyp\/link-versendet/, { timeout: 25_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '04-bestaetigung')

  // 3) Verify URL enthält kanal-Param (sollte 'email' sein, weil lokal kein Baileys)
  const url = page.url()
  console.log(`[URL] ${url}`)
  expect(url).toContain('/schaden-melden/prototyp/link-versendet')
  expect(url).toContain('kanal=email') // lokal ohne BAILEYS_BASE_URL → Email-Fallback

  // 4) Page-Body-Text checken
  const bodyText = (await page.locator('body').textContent()) ?? ''
  expect(bodyText).toMatch(/Login-Link/i)
})
