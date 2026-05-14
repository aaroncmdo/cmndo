import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-905 Final-Smoke ab Startseite. Realistischer Nutzer-Pfad:
// "/" → CTA → /schaden-melden → Mini-Wizard ausfuellen → /link-versendet.
// Im 2. Test: Karte-Variante ueber /gutachter-finden.
// Im 3. Test: alte 301-Redirects bestaetigen.
// Pro Step Screenshot in docs/14.05.2026/aar897-final-smoke/screens/.

const SCREENSHOT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  '14.05.2026',
  'aar897-final-smoke',
  'screens',
)
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)

let stepIdx = 0
async function shot(page: Page, name: string) {
  stepIdx += 1
  const f = `${String(stepIdx).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, f), fullPage: true })
  console.log(`[SHOT] ${f}`)
}

async function dismissCookie(page: Page) {
  await page
    .locator('.CookieConsent button, [class*="CookieConsent"] button')
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {})
}

test.describe.configure({ mode: 'serial' })

test('Final Smoke: Startseite → /schaden-melden Mini-Wizard → Magic-Link-Email', async ({ page }) => {
  test.setTimeout(90_000)
  const EMAIL = `smoke-final-startseite-${RUN_ID}@claimondo.de`

  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[BROWSER error] ${m.text()}`)
  })

  // ─── PHASE 1: Startseite ─────────────────────────────────────────────
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, 'startseite')

  // ─── PHASE 2: CTA "Schaden melden" → /schaden-melden ────────────────
  const cta = page.locator('a[href="/schaden-melden"]').first()
  await expect(cta).toBeVisible({ timeout: 15_000 })
  await cta.scrollIntoViewIfNeeded()
  await shot(page, 'startseite-cta-sichtbar')
  await cta.click()

  await page.waitForURL(/\/schaden-melden$|\/schaden-melden\?/, { timeout: 15_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, 'mini-wizard-leer')

  // ─── PHASE 3: Form ausfuellen ────────────────────────────────────────
  await page.locator('#unfallort').fill('Hauptstraße 12, 50667 Köln')
  await page.locator('#vorname').fill('Anna')
  await page.locator('#telefon').fill('+49 221 1234567')
  await page.locator('#email').fill(EMAIL)
  await page.locator('[data-slot="checkbox"]').first().click()
  await shot(page, 'mini-wizard-ausgefuellt')

  // ─── PHASE 4: Submit → Bestaetigung ──────────────────────────────────
  await page.getByRole('button', { name: /login-link erhalten/i }).click()
  await page.waitForURL(/\/schaden-melden\/link-versendet/, { timeout: 25_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, 'bestaetigung-link-versendet')

  const url = page.url()
  console.log(`[URL] ${url}`)
  expect(url).toContain('/schaden-melden/link-versendet')
  expect(url).toContain('kanal=email') // lokal ohne BAILEYS_BASE_URL

  // DB-Lookup ueber Dev-API
  const tokenLookup = await page.evaluate(async (email) => {
    const r = await fetch(`/api/dev/lookup-token?email=${encodeURIComponent(email)}`)
    return { status: r.status, body: await r.json().catch(() => null) }
  }, EMAIL)
  console.log(`[DB-VERIFY] email=${EMAIL}`)
  console.log(`[DB-VERIFY] lookup-token: status=${tokenLookup.status} token=${tokenLookup.body?.token ?? '(no)'}`)
  expect(tokenLookup.status).toBe(200)
  expect(tokenLookup.body?.token).toBeTruthy()
})

test('Final Smoke: /gutachter-finden Karte mit Toggle → Schnell-Anfrage', async ({ page }) => {
  test.setTimeout(90_000)
  const EMAIL = `smoke-final-karte-${RUN_ID}@claimondo.de`
  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  await page.goto('/gutachter-finden', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)
  await page.waitForTimeout(3_000) // Mapbox-Init
  await shot(page, 'karte-default-termin')

  // Toggle auf Schnell-Anfrage
  await page.getByRole('button', { name: /schnell-anfrage/i }).first().click()
  await page.waitForTimeout(500)
  await shot(page, 'karte-tab-schnell-anfrage')

  await page.locator('#unfallort').first().fill('Düsseldorf Hbf')
  await page.locator('#vorname').first().fill('Bert')
  await page.locator('#telefon').first().fill('+49 211 7654321')
  await page.locator('#email').first().fill(EMAIL)
  await page.locator('[data-slot="checkbox"]').first().click()
  await shot(page, 'karte-wizard-ausgefuellt')

  await page.getByRole('button', { name: /login-link erhalten/i }).first().click()
  await page.waitForURL(/\/schaden-melden\/link-versendet/, { timeout: 25_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, 'karte-bestaetigung')

  const tokenLookup = await page.evaluate(async (email) => {
    const r = await fetch(`/api/dev/lookup-token?email=${encodeURIComponent(email)}`)
    return { status: r.status, body: await r.json().catch(() => null) }
  }, EMAIL)
  console.log(`[DB-VERIFY karte] email=${EMAIL} token=${tokenLookup.body?.token ?? '(no)'}`)
  expect(tokenLookup.status).toBe(200)
})

test('Final Smoke: Selbstverschulden Soft-Filter', async ({ page }) => {
  test.setTimeout(60_000)
  const EMAIL = `smoke-final-selbst-${RUN_ID}@claimondo.de`
  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  await page.goto('/schaden-melden', { waitUntil: 'domcontentloaded' })
  await dismissCookie(page)
  await page.locator('input[value="eigenverantwortung"]').check()
  await page.locator('#unfallort').fill('A4 Köln-Süd')
  await page.locator('#telefon').fill('+49 221 9999999')
  await page.locator('#email').fill(EMAIL)
  await page.locator('[data-slot="checkbox"]').first().click()
  await shot(page, 'selbst-wizard')

  await page.getByRole('button', { name: /login-link erhalten/i }).click()
  await page.waitForURL(/\/schaden-melden\/selbstverschulden/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await shot(page, 'selbst-exit-page')

  expect(page.url()).toContain('/selbstverschulden')
})

test('Final Smoke: Alte 301-Redirects laufen', async ({ page }) => {
  test.setTimeout(30_000)
  page.on('pageerror', (e) => console.log(`[BROWSER pageerror] ${e.message}`))

  for (const oldPath of [
    '/schaden-melden/schritt-1',
    '/schaden-melden/schritt-2',
    '/schaden-melden/prototyp',
  ]) {
    const res = await page.goto(oldPath, { waitUntil: 'domcontentloaded' })
    const finalUrl = page.url()
    console.log(`[REDIRECT] ${oldPath} → ${finalUrl} (status=${res?.status()})`)
    expect(finalUrl).toMatch(/\/schaden-melden(?:\/|$|\?)/)
    expect(finalUrl).not.toContain('schritt-')
    expect(finalUrl).not.toContain('prototyp')
  }
  await shot(page, 'redirects-final')
})
