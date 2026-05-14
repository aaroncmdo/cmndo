import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// AAR-911 Smoke: SV verlegt einen bestätigten Termin via TerminVerlegenModal.
// Run gegen Staging:
//   npx playwright test tests/e2e/flows/smoke-staging-sv-termin-verlegen.spec.ts \
//     --project=chromium --reporter=list --headed

const BASE = 'https://app.staging.claimondo.de'
const BASIC_AUTH = { username: 'aaroncmdo', password: 'ClaimondoSuperuser123789!!' }
const SV_EMAIL = 'aaron.sprafke@claimondo.de'
const SV_PASS = 'Test1234!'

const OUT_DIR = path.join(
  process.cwd(),
  'docs',
  '14.05.2026',
  'aar911-sv-termin-verlegen',
)
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

async function loginAsSv(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[name="email"]', SV_EMAIL)
  await page.fill('input[name="password"]', SV_PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => {})
}

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true })
  console.log(`[SHOT] ${name}`)
}

function inSiebenTagen10Uhr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setHours(10, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

test('AAR-911: SV verlegt einen bestätigten Termin', async ({ browser }) => {
  test.setTimeout(300_000)

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: BASIC_AUTH,
  })
  const page = await ctx.newPage()

  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console] ${m.text()}`)
  })

  // 1) Login
  await loginAsSv(page)
  await shoot(page, '01-after-login.png')
  console.log(`[1] Post-Login URL: ${page.url()}`)

  // 2) Mehrere SV-Routen probieren — die Listen-/Heute-/Kalender-View
  // zeigt unterschiedliche Subsets der Termine. Fall-Detail-Links können
  // auch unter `/gutachter/auftrag/`-Pattern liegen, falls keine direkten
  // Fall-Routen existieren.
  const ROUTES_TO_PROBE = [
    '/gutachter/heute',
    '/gutachter/auftraege',
    '/gutachter/kalender',
    '/gutachter/meine-faelle',
  ]
  let fallLink = page.locator('a[href*="/gutachter/fall/"], a[href*="/gutachter/auftrag/"]').first()
  let hatFall = 0
  for (const route of ROUTES_TO_PROBE) {
    console.log(`[2] Probiere ${route}`)
    await page.goto(`${BASE}${route}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1500)
    const slug = route.replace(/\//g, '-').replace(/^-/, '')
    await shoot(page, `02-${slug}.png`)
    fallLink = page.locator('a[href*="/gutachter/fall/"], a[href*="/gutachter/auftrag/"]').first()
    hatFall = await fallLink.count()
    console.log(`[2] Fall-/Auftrag-Links auf ${route}: ${hatFall}`)
    if (hatFall > 0) break
  }
  if (hatFall === 0) {
    console.log('[STOP] keine Fall-Links auf /auftraege oder /kalender')
    await shoot(page, '03-keine-faelle.png')
    await ctx.close()
    return
  }

  // 3) Iteriere über ALLE Fall-Links bis einer mit verlegbarem Termin
  // gefunden ist (Verlegen-Button erscheint nur bei bestaetigt-Status).
  await page.goto(`${BASE}/gutachter/kalender`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2500)
  const alleFallLinks = await page
    .locator('a[href*="/gutachter/fall/"], a[href*="/gutachter/auftrag/"]')
    .evaluateAll((els) =>
      Array.from(new Set(els.map((el) => (el as HTMLAnchorElement).href))),
    )
  console.log(`[3] Eindeutige Fall-URLs: ${alleFallLinks.length}`)
  alleFallLinks.forEach((u, i) => console.log(`     [${i}] ${u}`))

  let verlegenBtn = page.getByRole('button', { name: /termin verlegen/i }).first()
  let verlegbar = 0
  let gefundenAuf = ''
  for (const url of alleFallLinks) {
    await page.goto(url)
    await page.waitForLoadState('networkidle').catch(() => {})
    // 6s warten — AuftragHeaderPanel hat eigenes RSC-Loading
    await page.waitForTimeout(6000)
    verlegenBtn = page.getByRole('button', { name: /termin verlegen/i }).first()
    verlegbar = await verlegenBtn.count()
    console.log(`[3] ${url} → Verlegen-Button: ${verlegbar}`)
    if (verlegbar > 0) {
      gefundenAuf = url
      break
    }
  }
  await shoot(page, '03-fall-detail.png')

  if (verlegbar === 0) {
    console.log('[STOP] Kein Fall mit bestaetigt-Termin gefunden — Test-Daten-Setup nötig')
    await ctx.close()
    return
  }
  console.log(`[4] Verlegbarer Termin gefunden auf: ${gefundenAuf}`)
  await expect(verlegenBtn).toBeVisible({ timeout: 10_000 })
  await verlegenBtn.click()
  await shoot(page, '04-modal-open.png')

  // 5) Eigener Slot setzen
  const dateInput = page.locator('input[type="datetime-local"]').first()
  await expect(dateInput).toBeVisible({ timeout: 5_000 })
  const slot = inSiebenTagen10Uhr()
  await dateInput.fill(slot)
  console.log(`[5] Slot: ${slot}`)
  await shoot(page, '05-modal-slot-gesetzt.png')

  // 6) Grund
  const grund = page.locator('textarea').first()
  if ((await grund.count()) > 0) {
    await grund.fill('Smoke-Test AAR-911 — bitte ignorieren')
    await shoot(page, '06-modal-grund.png')
  }

  // 7) Submit
  const submit = page.getByRole('button', { name: /verlegung.{0,3}beantragen|beantragen/i }).last()
  await expect(submit).toBeEnabled({ timeout: 5_000 })
  await submit.click()
  await page.waitForTimeout(3000)
  await shoot(page, '07-nach-submit.png')

  // 8) Banner-Check
  const banner = page.getByText(/verlegung beantragt|bestätigung ausstehend/i).first()
  const bannerVisible = await banner.isVisible().catch(() => false)
  console.log(`[8] Banner sichtbar: ${bannerVisible}`)
  await shoot(page, '08-final.png')

  console.log(`[END] Console-Errors: ${errors.length}`)
  errors.slice(0, 10).forEach((e) => console.log(`  ${e}`))
  await ctx.close()
})
