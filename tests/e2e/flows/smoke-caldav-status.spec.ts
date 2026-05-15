import { test, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// Schneller Status-Smoke: zeigt nur die CalDAV-Verbindungs-Seite damit
// wir sehen ob Test-Aaron eine aktive CalDAV-Verbindung hat.
//
// Pflicht-Envs identisch zu smoke-caldav-freebusy.spec.ts:
//   STAGING_BASIC_USER, STAGING_BASIC_PASS, SV_EMAIL, SV_PASS
// Optional: STAGING_BASE_URL

const BASE = process.env.STAGING_BASE_URL ?? 'https://app.staging.claimondo.de'

const BASIC_USER = process.env.STAGING_BASIC_USER ?? ''
const BASIC_PASS = process.env.STAGING_BASIC_PASS ?? ''
const SV_EMAIL = process.env.SV_EMAIL ?? ''
const SV_PASS = process.env.SV_PASS ?? ''
const HAS_ENVS = !!(BASIC_USER && BASIC_PASS && SV_EMAIL && SV_PASS)

const OUT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  '14.05.2026',
  'caldav-freebusy-smoke',
)

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true })
}

test('Status: CalDAV-Verbindung + Liste-View', async ({ browser }) => {
  test.skip(
    !HAS_ENVS,
    'CalDAV-Smoke: STAGING_BASIC_USER/PASS + SV_EMAIL/PASS Envs fehlen — manuelle Smoke (siehe Spec-Header)',
  )
  test.setTimeout(120_000)
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
  })
  const page = await ctx.newPage()

  // Login zuerst — Cookie liegt im ctx, beide Folge-Goto's haben die Session.
  await page.goto(`${BASE}/login`)
  await page.fill('input[name="email"]', SV_EMAIL)
  await page.fill('input[name="password"]', SV_PASS)
  await page.click('button[type="submit"]')
  await page
    .waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 60_000 })
    .catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})

  await page.goto(`${BASE}/gutachter/einstellungen/kalender`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await shoot(page, '05-einstellungen-kalender.png')
  const html1 = await page.content()
  fs.writeFileSync(path.join(OUT_DIR, 'einstellungen.html'), html1, 'utf-8')

  await page.goto(`${BASE}/gutachter/kalender?view=liste`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await shoot(page, '06-kalender-liste.png')
  const html2 = await page.content()
  fs.writeFileSync(path.join(OUT_DIR, 'kalender-liste.html'), html2, 'utf-8')

  await ctx.close()
})
