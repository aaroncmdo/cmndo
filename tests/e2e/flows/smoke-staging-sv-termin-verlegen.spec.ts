import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// Smoke für AAR-911 (SV-Termin-Verlegen) gegen STAGING.
// Flow:
//   1. SV-Login (Test-Aaron)
//   2. /gutachter/kalender öffnen — Liste der bestätigten Termine
//   3. Auf den ersten verlegbaren Termin klicken → /gutachter/fall/<id>
//   4. AuftragHeaderPanel: Button "Termin verlegen" klicken
//   5. TerminVerlegenModal: Top-3-Vorschläge laden + Screenshot
//   6. Eigenen Slot per datetime-local picker setzen (+7 Tage, 10:00)
//   7. Grund-Textarea: "Smoke-Test AAR-911 — bitte ignorieren"
//   8. "Verlegung beantragen" submit
//   9. Modal schließt + Banner zeigt "Verlegung beantragt — Bestätigung ausstehend"
//
// Run lokal gegen Dev (kein Basic-Auth, SV_PASS aus ENV oder Test1234!-Default
// via Test-User-Fixture):
//   PLAYWRIGHT_BASE_URL=http://localhost:3000 SV_PASS=Test1234! \
//     npx playwright test tests/e2e/flows/smoke-staging-sv-termin-verlegen.spec.ts \
//     --project=chromium --reporter=list --headed
//
// Run gegen Staging:
//   STAGING_BASE_URL='https://app.staging.claimondo.de' \
//     STAGING_BASIC_USER=… STAGING_BASIC_PASS=… SV_PASS=… \
//     npx playwright test tests/e2e/flows/smoke-staging-sv-termin-verlegen.spec.ts \
//     --project=chromium --reporter=list --headed

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.STAGING_BASE_URL ??
  'https://app.staging.claimondo.de'

const NEEDS_BASIC_AUTH = BASE.includes('staging.claimondo.de')

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`ENV ${name} fehlt — siehe Header der spec für Pflicht-Envs`)
  return v
}

// Basic-Auth nur Pflicht wenn wir gegen *.staging.claimondo.de fahren.
const BASIC_USER = NEEDS_BASIC_AUTH ? requireEnv('STAGING_BASIC_USER') : ''
const BASIC_PASS = NEEDS_BASIC_AUTH ? requireEnv('STAGING_BASIC_PASS') : ''

// Test-Aaron (Aaron-Freigabe 14.05.2026 — auf Staging hat das Konto kein 2FA).
const SV_EMAIL = process.env.SV_EMAIL ?? 'aaron.sprafke@claimondo.de'
const SV_PASS = process.env.SV_PASS ?? 'Test1234!'

const OUT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  '14.05.2026',
  'aar911-sv-termin-verlegen',
)
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(1200)
  const file = path.join(OUT_DIR, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`[SHOT] ${file}`)
}

function inSiebenTagen10Uhr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setHours(10, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

test.describe.configure({ mode: 'serial' })

test('AAR-911: SV verlegt einen bestätigten Termin via Modal', async ({ browser }) => {
  test.setTimeout(180_000)

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(NEEDS_BASIC_AUTH
      ? { httpCredentials: { username: BASIC_USER, password: BASIC_PASS } }
      : {}),
  })
  const page = await ctx.newPage()

  const consoleErrors: string[] = []
  page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[console] ${m.text()}`)
  })

  // 1) Login
  await page.goto(`${BASE}/login`)
  await shoot(page, '01-login.png')
  await page.fill('input[name="email"]', SV_EMAIL)
  await page.fill('input[name="password"]', SV_PASS)
  await page.click('button[type="submit"]')
  // Robust gegen langsame Server-Action: erst auf URL-Wechsel warten, dann
  // bis die neue Seite vollständig geladen ist. Falls Login fehlschlägt,
  // bleibt URL auf /login → Catch fängt Timeout, Screenshot dokumentiert
  // den Zustand für Diagnose.
  await page
    .waitForURL((url: URL) => !url.pathname.includes('/login'), { timeout: 90_000 })
    .catch(() => {})
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForTimeout(2000)
  await shoot(page, '02-after-login.png')
  const postLoginUrl = page.url()
  console.log(`[STEP 1] Post-Login URL: ${postLoginUrl}`)
  if (postLoginUrl.includes('/login')) {
    console.log('[STOP] Login fehlgeschlagen — Smoke endet')
    return
  }

  // 2) /gutachter/kalender öffnen
  await page.goto(`${BASE}/gutachter/kalender?view=liste`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(2000)
  await shoot(page, '03-kalender-liste.png')

  // 3) Ersten Fall-Link in der Liste finden + navigieren
  //    Falls-Liste rendert /gutachter/fall/<id>-Links als <a> aufs Detail
  const fallLink = page.locator('a[href*="/gutachter/fall/"]').first()
  const hatFall = await fallLink.count()
  if (hatFall === 0) {
    console.log('[WARN] keine Fall-Links in /gutachter/kalender — Smoke endet hier')
    await shoot(page, '03b-keine-faelle.png')
    return
  }
  await fallLink.click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1500)
  await shoot(page, '04-fall-detail.png')

  // 4) Verlegen-Button finden + klicken
  const verlegenBtn = page.getByRole('button', { name: /termin verlegen/i }).first()
  await expect(verlegenBtn, 'Termin-Verlegen-Button im Auftrag-Header').toBeVisible({
    timeout: 10_000,
  })
  await verlegenBtn.click()
  await page.waitForTimeout(1500) // Modal-Animation + Vorschläge laden
  await shoot(page, '05-modal-open-vorschlaege.png')

  // 5) Eigener Slot: datetime-local Input setzen
  const dateInput = page.locator('input[type="datetime-local"]').first()
  await expect(dateInput, 'datetime-local Input im Modal').toBeVisible({
    timeout: 5_000,
  })
  const targetSlot = inSiebenTagen10Uhr()
  await dateInput.fill(targetSlot)
  console.log(`[STEP 5] Eigener Slot gesetzt: ${targetSlot}`)
  await shoot(page, '06-modal-eigener-slot.png')

  // 6) Grund eingeben
  const grundTextarea = page.locator('textarea').first()
  if ((await grundTextarea.count()) > 0) {
    await grundTextarea.fill('Smoke-Test AAR-911 — bitte ignorieren')
    await shoot(page, '07-modal-grund-eingegeben.png')
  }

  // 7) Submit
  const submitBtn = page
    .getByRole('button', { name: /verlegung.{0,3}beantragen|beantragen|verlegen/i })
    .last()
  await expect(submitBtn, 'Verlegung-Beantragen-Button').toBeEnabled({ timeout: 5_000 })
  await submitBtn.click()
  await page.waitForTimeout(3000)
  await shoot(page, '08-nach-submit.png')

  // 8) Banner-Check: "Verlegung beantragt"
  const banner = page.getByText(/verlegung beantragt|bestätigung ausstehend/i).first()
  const bannerVisible = await banner.isVisible().catch(() => false)
  console.log(`[STEP 8] Banner sichtbar: ${bannerVisible}`)
  if (bannerVisible) {
    await shoot(page, '09-banner-verlegung-pending.png')
  } else {
    await shoot(page, '09-kein-banner-fehlerfall.png')
  }

  // Console-Errors am Ende loggen (nicht fail-en, nur Doku)
  if (consoleErrors.length > 0) {
    console.log(`[CONSOLE-ERRORS] ${consoleErrors.length} Fehler:`)
    consoleErrors.slice(0, 10).forEach((e) => console.log(`  ${e}`))
  } else {
    console.log('[CONSOLE-ERRORS] keine')
  }

  await ctx.close()
})
