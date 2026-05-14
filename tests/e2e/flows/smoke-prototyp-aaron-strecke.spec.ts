import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-902 Komplett-Strecke mit Aaron-Daten (Smoke 14.05.2026).
// Fuellt den Mini-Wizard auf /gutachter-finden (Karte) mit Aaron-Nummer
// +1633628571 und Email aaron.sprafke@claimondo.de. Stoppt nach
// Bestaetigungs-Page — Aaron klickt den Magic-Link manuell aus seinem
// Posteingang. So entsteht kein automatischer Account-Anlage-Run der
// in Production landen wuerde.
//
// Lokal smoken: dev-server muss auf localhost:3000 laufen.
// Result: Token + Magic-Link-URL erscheinen im Test-Output.

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
const AARON_EMAIL = 'aaron.sprafke@claimondo.de'
const AARON_TELEFON = '+1633628571'
const AARON_VORNAME = 'Aaron'

let stepIdx = 200
async function shot(page: Page, name: string) {
  stepIdx += 1
  const filename = `${String(stepIdx).padStart(3, '0')}-aaron-${name}.png`
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    fullPage: true,
  })
  console.log(`[SHOT] ${filename}`)
}

test.describe.configure({ mode: 'serial' })

test('AARON-Strecke: /gutachter-finden Karten-Wizard → Magic-Link an Aaron', async ({ page }) => {
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

  // Mapbox-Init abwarten
  await page.waitForTimeout(3_000)
  await shot(page, 'karte-initial-no-scrollbar')

  // Mini-Wizard in der Sidebar (Desktop) ausfuellen
  await page.locator('#vorname').first().fill(AARON_VORNAME)
  await page.locator('#unfallort').first().fill('Hauptstraße 12, 50667 Köln')
  await page.locator('#telefon').first().fill(AARON_TELEFON)
  await page.locator('#email').first().fill(AARON_EMAIL)
  const dsgvo = page.locator('[data-slot="checkbox"]').first()
  await dsgvo.scrollIntoViewIfNeeded()
  await dsgvo.click()

  await shot(page, 'karte-mit-aaron-daten')

  await page
    .getByRole('button', { name: /login-link erhalten/i })
    .first()
    .click()

  await page.waitForURL(/\/schaden-melden\/prototyp\/link-versendet/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, 'bestaetigung-magic-link-an-aaron')

  expect(page.url()).toContain('/schaden-melden/prototyp/link-versendet')

  console.log('\n========================================================')
  console.log(`[AARON-SMOKE] Run-ID: ${RUN_ID}`)
  console.log(`[AARON-SMOKE] Email: ${AARON_EMAIL}`)
  console.log(`[AARON-SMOKE] Telefon: ${AARON_TELEFON}`)
  console.log(`[AARON-SMOKE] Bestaetigungs-URL: ${page.url()}`)
  console.log('[AARON-SMOKE] Magic-Link kommt per Email — Token + URL gleich')
  console.log('[AARON-SMOKE] via Supabase-Query separat ausgegeben.')
  console.log('========================================================\n')
})
