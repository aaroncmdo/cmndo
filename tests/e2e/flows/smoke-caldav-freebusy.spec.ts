import { test, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// Smoke für PR #1147 (CalDAV-FreeBusy aus Cache lesen).
// Aaron hat heute (2026-05-14) auf seinem iPhone einen Termin für den
// Test-SV "Test-Aaron Test-Sprafke" angelegt. Wenn die CalDAV-Verbindung
// + der Cron + die Cache-Read-Logik korrekt laufen, muss dieser Termin
// in /gutachter/kalender als „Gebucht"-Pill auftauchen.
//
// Pflicht-Envs (kein Default — Test failt sofort wenn nicht gesetzt):
//   STAGING_BASIC_USER   Basic-Auth-User für *.staging.claimondo.de
//   STAGING_BASIC_PASS   Basic-Auth-PW
//   SV_EMAIL             E-Mail des Test-SV (z.B. aaron.sprafke@claimondo.de)
//   SV_PASS              Passwort des Test-SV
//
// Optional:
//   STAGING_BASE_URL     Default https://app.staging.claimondo.de
//
// Run:
//   STAGING_BASIC_USER=… STAGING_BASIC_PASS=… SV_EMAIL=… SV_PASS=… \
//     npx playwright test tests/e2e/flows/smoke-caldav-freebusy.spec.ts \
//     --project=chromium --reporter=list

const BASE = process.env.STAGING_BASE_URL ?? 'https://app.staging.claimondo.de'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`ENV ${name} fehlt — siehe Header der spec für Pflicht-Envs`)
  return v
}

const BASIC_USER = requireEnv('STAGING_BASIC_USER')
const BASIC_PASS = requireEnv('STAGING_BASIC_PASS')
const SV_EMAIL = requireEnv('SV_EMAIL')
const SV_PASS = requireEnv('SV_PASS')

const OUT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  '14.05.2026',
  'caldav-freebusy-smoke',
)
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(1500)
  const file = path.join(OUT_DIR, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`[SHOT] ${file}`)
}

test.describe.configure({ mode: 'serial' })

test('SV-Kalender: CalDAV-FreeBusy-Pills (iPhone-Termin von heute)', async ({ browser }) => {
  test.setTimeout(180_000)

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
  })
  const page = await ctx.newPage()

  const consoleErrors: string[] = []
  page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[console] ${m.text()}`)
  })

  // 1) Login als Test-Aaron
  await page.goto(`${BASE}/login`)
  await shoot(page, '01-login.png')
  await page.fill('input[name="email"]', SV_EMAIL)
  await page.fill('input[name="password"]', SV_PASS)
  await page.click('button[type="submit"]')
  await page
    .waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 60_000 })
    .catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
  await shoot(page, '02-after-login.png')

  // 2) SV-Kalender öffnen
  await page.goto(`${BASE}/gutachter/kalender`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2500)
  await shoot(page, '03-sv-kalender-kalender-view.png')

  // 3) Liste-View
  await page.goto(`${BASE}/gutachter/kalender?view=liste`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2000)
  await shoot(page, '04-sv-kalender-liste-view.png')

  // 4) Kalender-Einstellungen (zeigt Verbindungs-Status Google + CalDAV)
  await page.goto(`${BASE}/gutachter/einstellungen/kalender`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2000)
  await shoot(page, '05-sv-einstellungen-kalender.png')

  // 5) DOM-Snapshot vom Kalender-View für nachträgliche Analyse
  await page.goto(`${BASE}/gutachter/kalender`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2500)
  const html = await page.content()
  fs.writeFileSync(path.join(OUT_DIR, 'kalender.html'), html, 'utf-8')
  console.log('[HTML] kalender.html geschrieben')

  // Versuch, eine „Gebucht"-Pill zu finden
  const pillCount = await page.locator('text=/Gebucht|gebucht|Privat|Apple|iPhone/i').count()
  console.log(`[PILL-COUNT] mögliche FreeBusy-Pills auf der Seite: ${pillCount}`)

  if (consoleErrors.length) {
    console.log('Errors:', consoleErrors.slice(0, 20).join('\n'))
  }

  await ctx.close()
})
