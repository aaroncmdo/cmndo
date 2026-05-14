import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-902 Prototyp-Smoke: Mini-Wizard auf /schaden-melden/prototyp.
// Bestaetigt: Form ausfuellen -> Lead in DB -> flow_links-Token -> Magic-Link-
// Email (im Dev-Server gelogged) -> Bestaetigungs-Page. Klick auf den Token
// fuehrt zum existierenden /flow/[token]-Pfad (eigener Smoke).

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

const RUN_ID = new Date()
  .toISOString()
  .replace(/[^0-9]/g, '')
  .slice(0, 14)

let stepIdx = 0
async function shot(page: Page, name: string) {
  stepIdx += 1
  const filename = `${String(stepIdx).padStart(2, '0')}-${name}.png`
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

test('Prototyp Mini-Wizard: Haftpflicht-Path → Magic-Link versendet', async ({ page }) => {
  test.setTimeout(60_000)

  page.on('console', (m) => {
    const t = m.type()
    if (t === 'error' || t === 'warning') console.log(`[BROWSER ${t}] ${m.text()}`)
  })
  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  await page.goto('/schaden-melden/prototyp', { waitUntil: 'domcontentloaded' })
  await dismissCookieBanner(page)
  await shot(page, 'wizard-leer')

  // Schuldfrage = gegner (default), unfalldatum default, fuelle den Rest
  await page.locator('#unfallort').fill('Hauptstraße 12, 50667 Köln')
  await page.locator('#vorname').fill('Anna')
  await page.locator('#telefon').fill('+49 221 1234567')
  await page.locator('#email').fill(`smoke-prototyp-${RUN_ID}@claimondo.de`)

  const dsgvo = page.locator('[data-slot="checkbox"]').first()
  await dsgvo.scrollIntoViewIfNeeded()
  await dsgvo.click()

  await shot(page, 'wizard-ausgefuellt-haftpflicht')

  await page.getByRole('button', { name: /login-link erhalten/i }).click()

  await page.waitForURL(/\/schaden-melden\/prototyp\/link-versendet/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, 'bestaetigung-haftpflicht')

  expect(page.url()).toContain('/schaden-melden/prototyp/link-versendet')
  expect(await page.locator('body').textContent()).toMatch(/Login-Link/i)
})

test('Prototyp Mini-Wizard: Selbstverschulden → Soft-Filter-Exit', async ({ page }) => {
  test.setTimeout(60_000)

  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  await page.goto('/schaden-melden/prototyp', { waitUntil: 'domcontentloaded' })
  await dismissCookieBanner(page)

  // Schuldfrage auf 'eigenverantwortung' aendern
  await page.locator('input[value="eigenverantwortung"]').check()
  await page.locator('#unfallort').fill('A4 Köln-Süd')
  await page.locator('#telefon').fill('+49 221 7654321')
  await page.locator('#email').fill(`smoke-selbst-${RUN_ID}@claimondo.de`)
  const dsgvo = page.locator('[data-slot="checkbox"]').first()
  await dsgvo.click()

  await shot(page, 'wizard-ausgefuellt-selbstverschulden')

  await page.getByRole('button', { name: /login-link erhalten/i }).click()

  await page.waitForURL(/\/schaden-melden\/prototyp\/selbstverschulden/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, 'selbstverschulden-soft-filter')

  expect(page.url()).toContain('/selbstverschulden')
  expect(await page.locator('body').textContent()).toMatch(/Kasko/i)
})
