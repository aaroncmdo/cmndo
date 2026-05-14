import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-906 Staging-Live-Smoke nach Deploy: gegen https://staging.claimondo.de
// mit nginx-Basic-Auth. Smoket den kompletten Mini-Wizard-Pfad inkl.
// realer Baileys-WA-Service (wenn dein Service auf VPS:3055 lauft).
//
// Run:
//   STAGING_BASE_URL=https://staging.claimondo.de STAGING_BASIC_USER=...
//   STAGING_BASIC_PASS=... npx playwright test smoke-staging-live --headed

const SCREENSHOT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  '14.05.2026',
  'aar906-staging-smoke',
  'screens',
)
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const BASE = process.env.STAGING_BASE_URL ?? 'https://staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_PASS ?? ''
const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
const EMAIL = `smoke-staging-${RUN_ID}@claimondo.de`

let stepIdx = 0
async function shot(page: Page, name: string) {
  stepIdx += 1
  const f = `${String(stepIdx).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, f), fullPage: true })
  console.log(`[SHOT-STAGING] ${f}`)
}

async function dismissCookie(page: Page) {
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {})
}

test.use({
  baseURL: BASE,
  httpCredentials: BASIC_PASS
    ? { username: BASIC_USER, password: BASIC_PASS }
    : undefined,
})

test.describe.configure({ mode: 'serial' })

test('Staging Live: Startseite → /schaden-melden Mini-Wizard', async ({ page }) => {
  test.setTimeout(120_000)
  if (!BASIC_PASS) test.skip(true, 'STAGING_BASIC_PASS nicht gesetzt')

  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '01-staging-startseite')

  // CTA → /schaden-melden
  await page.locator('a[href="/schaden-melden"]').first().click()
  await page.waitForURL(/\/schaden-melden(?:\?|$)/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '02-staging-mini-wizard')

  // Pflichtfelder
  await page.locator('#unfallort').fill('Hauptstraße 12, 50667 Köln')
  await page.locator('#vorname').fill('AnnaStaging')
  await page.locator('#nachname').fill('StagingTest')
  await page.locator('#telefon').fill('+49 221 1234567')
  await page.locator('#email').fill(EMAIL)
  await page.locator('[data-slot="checkbox"]').first().click()
  await shot(page, '03-staging-ausgefuellt')

  await page.getByRole('button', { name: /login-link erhalten/i }).click()
  await page.waitForURL(/\/schaden-melden\/link-versendet/, { timeout: 30_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, '04-staging-bestaetigung')

  const url = page.url()
  console.log(`[STAGING URL] ${url}`)
  expect(url).toContain('/schaden-melden/link-versendet')

  // Kanal-Check: wenn Baileys auf staging laeuft, sollte 'kanal=whatsapp'
  // erscheinen (sofern die Test-Nummer auf WhatsApp existiert). Andernfalls
  // Email-Fallback. Beides ist OK — wir loggen nur was passiert ist.
  if (url.includes('kanal=whatsapp')) {
    console.log('[STAGING] WhatsApp-Kanal aktiv ✓')
  } else if (url.includes('kanal=email')) {
    console.log('[STAGING] Email-Fallback verwendet')
  } else {
    console.log('[STAGING] Kein kanal-Param sichtbar')
  }
})

test('Staging Live: /gutachter-finden Karte mit Toggle', async ({ page }) => {
  test.setTimeout(120_000)
  if (!BASIC_PASS) test.skip(true, 'STAGING_BASIC_PASS nicht gesetzt')
  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  await page.goto('/gutachter-finden', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)
  await page.waitForTimeout(4_000) // Mapbox-Init braucht laenger auf staging
  await shot(page, '05-staging-karte-default')

  await expect(
    page.getByRole('button', { name: /termin direkt buchen/i }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /schnell-anfrage/i }).first(),
  ).toBeVisible()

  await page.getByRole('button', { name: /schnell-anfrage/i }).first().click()
  await page.waitForTimeout(800)
  await shot(page, '06-staging-karte-toggle')

  await expect(page.locator('#unfallort').first()).toBeVisible()
})

test('Staging Live: 301-Redirects', async ({ page }) => {
  test.setTimeout(60_000)
  if (!BASIC_PASS) test.skip(true, 'STAGING_BASIC_PASS nicht gesetzt')

  for (const oldPath of [
    '/schaden-melden/schritt-1',
    '/schaden-melden/schritt-2',
    '/schaden-melden/prototyp',
  ]) {
    await page.goto(oldPath, { waitUntil: 'domcontentloaded' })
    const finalUrl = page.url()
    console.log(`[REDIRECT-STAGING] ${oldPath} → ${finalUrl}`)
    expect(finalUrl).toMatch(/\/schaden-melden(?:\/|$|\?)/)
    expect(finalUrl).not.toContain('schritt-')
    expect(finalUrl).not.toContain('prototyp')
  }
  await shot(page, '07-staging-redirects-ok')
})
