import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// Vertrieb-Konsole Admin-Smoke gegen Prod (/admin/vertrieb). READ-ONLY — keine Mutation.
// Prueft: Switch-Ansicht (Leads/Partner) + Rolle-Filter + Roster-Daten + Liste/Karte-Toggle.
//
// Opt-in (NIE in CI): RUN_VERTRIEB_SMOKE=1 — laeuft echt gegen Prod.
// Run:
//   RUN_VERTRIEB_SMOKE=1 TEST_ADMIN_PASSWORD=(process.env.TEST_PASSWORT ?? '') \
//     npx playwright test tests/e2e/flows/smoke-vertrieb-prod.spec.ts \
//     --project=chromium --reporter=list --workers=1

const APP = 'https://app.claimondo.de'
const CRED = {
  email: process.env.TEST_ADMIN_EMAIL ?? 'test-admin@claimondo.de',
  pass: process.env.TEST_ADMIN_PASSWORD ?? '',
}

const OUT_DIR = path.join(process.cwd(), 'test-results', 'vertrieb-smoke')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true })
  console.log(`[SHOT] ${name}`)
}

async function login(page: Page) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('#email', { timeout: 15_000 })
  await page.locator('#email').fill(CRED.email)
  await page.locator('input[type="password"], input[name="password"]').first().fill(CRED.pass)
  await page.waitForTimeout(500)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(8_000)
  if (page.url().includes('/login')) {
    await page.screenshot({ path: path.join(OUT_DIR, '00-login-state.png'), fullPage: true })
    throw new Error(`Login fehlgeschlagen: ${page.url()}`)
  }
  await page.waitForLoadState('networkidle').catch(() => {})
}

test.skip(!process.env.RUN_VERTRIEB_SMOKE, 'set RUN_VERTRIEB_SMOKE=1 (läuft echt gegen Prod)')
test.describe.configure({ mode: 'serial' })

test('Vertrieb-Smoke: /admin/vertrieb Switch-Ansicht + Roster + Karte-Toggle', async ({ browser }) => {
  test.setTimeout(90_000)
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error(`[BROWSER pageerror] ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[BROWSER console.error] ${m.text()}`) })

  try {
    await login(page)

    await page.goto(`${APP}/admin/vertrieb`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2_000)
    await shot(page, '01-vertrieb-initial.png')

    expect(page.url(), 'Darf nicht auf /login redirected haben').not.toContain('/login')

    // 1) Konsolen-Titel + Switch-Ansicht
    await expect(page.getByRole('heading', { name: /^Vertrieb$/i }).first(), 'Titel "Vertrieb"').toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /^Leads$/ }).first(), 'Typ-Switch "Leads"').toBeVisible()
    await expect(page.getByRole('button', { name: /^Partner$/ }).first(), 'Typ-Switch "Partner"').toBeVisible()
    await expect(page.getByRole('button', { name: /^Makler$/ }).first(), 'Rolle-Filter "Makler"').toBeVisible()
    console.log('[smoke] ✓ Switch-Ansicht (Leads/Partner + Rolle-Filter) sichtbar')

    // 2) Roster-Daten geladen (die 98 Kontakte -> mind. eine Zeile). Suche eine Rolle-Zelle.
    const svZellen = page.getByRole('cell', { name: /Sachverständige/ })
    await expect(svZellen.first(), 'Mind. eine Roster-Zeile (Rolle Sachverständige)').toBeVisible({ timeout: 10_000 })
    console.log(`[smoke] ✓ Roster hat Daten (Sachverständige-Zellen: ${await svZellen.count()})`)

    // 3) Liste/Karte-Toggle: auf Karte umschalten, Map-Container erscheint (oder Fehler-State = auch ok = gerendert)
    await page.getByRole('button', { name: /^Karte$/ }).first().click()
    await page.waitForTimeout(3_000)
    const mapPresent = await page.locator('.mapboxgl-canvas, [aria-label="Vertrieb-Kontakte-Karte"], canvas').count()
    console.log(`[smoke] Karte-Container nach Toggle: ${mapPresent} (>=1 = gerendert)`)
    await shot(page, '02-vertrieb-karte.png')
    expect(mapPresent, 'Karte-Ansicht muss einen Container rendern').toBeGreaterThan(0)

    console.log('[smoke] ✅ Vertrieb-Smoke abgeschlossen (read-only, keine Mutation)')
  } finally {
    await ctx.close()
  }
})
