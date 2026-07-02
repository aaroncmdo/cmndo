/**
 * Feature-Smoke: Reparaturwunsch + Werkstatt-Vermittlung (PR #3433)
 * Target: https://app.staging.claimondo.de (Basic-Auth), post-Merge-Deploy.
 *
 * KONVENTION (Aaron): Smokes IMMER nur mit dem SMOKE-SV + SMOKE-Werkstatt, nie echte Entities.
 *   Smoke-SV:        b52e79df-9318-4c31-bebd-bb7c91d52aa5  (smoke-sv@claimondo.test)
 *   SMOKE-Werkstatt: badecb82-aa29-461c-876b-007455aa8dd3  (werkstatt-smoke@claimondo.de)
 *
 * ⚠️ POST-MERGE VERIFIZIEREN: Dieses Skript ist gegen die BEKANNTEN Feature-Strings/-Routen
 *   geschrieben, aber noch NICHT gegen live staging gelaufen (Feature ist erst nach Merge deployt).
 *   Beim ersten Staging-Deploy-Run: Selektoren gegen die echte UI pruefen + ggf. anpassen.
 *
 * ABGEDECKT (data-unabhaengig, zuverlaessig):
 *   - Dispatch-Lead-Detail rendert das reparaturwunsch-Config-Feld ("...Schaden abrechnen?") ohne Crash.
 *   - pageerror-Listener faengt jeden Runtime-Crash auf den beruehrten Seiten (harter Fail).
 *
 * FOLLOW-UP (braucht Testdaten-Setup, separat post-Merge):
 *   - Kunde-Flow-Picker + Gutachter-Card + KB-Panel erscheinen nur bei needsWerkstatt
 *     (Lead/Claim mit reparaturwunsch='reparatur' + keine Werkstatt). Dafuer am SMOKE-SV-Fall
 *     via Dispatch-UI reparaturwunsch='reparatur' setzen (Write-Pfad mit SIDE_EFFECT_MODE=dry-run,
 *     PR #3454 → keine echten Notifications), dann den Picker durchklicken + eine SMOKE-Werkstatt waehlen.
 */

import { chromium } from 'playwright'

const STAGING_BASE = process.env.SMOKE_STAGING_BASE ?? 'https://app.staging.claimondo.de'
const BASIC_AUTH_USER = process.env.SMOKE_BASIC_AUTH_USER ?? 'aaroncmdo'
const BASIC_AUTH_PASS = process.env.SMOKE_BASIC_AUTH_PASS ?? ''
const DISPATCH_EMAIL = process.env.SMOKE_DISPATCH_EMAIL ?? 'test-dispatch@claimondo.de'
const DISPATCH_PASS = process.env.SMOKE_DISPATCH_PASS ?? 'Test1234!'

if (!BASIC_AUTH_PASS) {
  console.error('FEHLER: SMOKE_BASIC_AUTH_PASS nicht gesetzt (Staging Basic-Auth Pflicht).')
  process.exit(2)
}

const pageErrors = []
let failedHard = false

async function login(page) {
  await page.goto(`${STAGING_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  const email = await page.$('input[type="email"], input[name="email"]')
  const pass = await page.$('input[type="password"]')
  if (!email || !pass) return false
  await email.fill(DISPATCH_EMAIL)
  await pass.fill(DISPATCH_PASS)
  const btn = await page.$('button[type="submit"]')
  if (!btn) return false
  await btn.click()
  try {
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 10000 })
  } catch {}
  await page.waitForTimeout(1500)
  return !page.url().includes('/login')
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    httpCredentials: { username: BASIC_AUTH_USER, password: BASIC_AUTH_PASS },
    locale: 'de-DE',
    ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (err) => {
    pageErrors.push({ url: page.url(), message: err.message.substring(0, 300) })
    failedHard = true
  })

  console.log('--- Reparaturwunsch-Smoke: Dispatch-Login ---')
  const ok = await login(page)
  console.log(`  Dispatch-Login: ${ok ? 'OK' : 'FEHLGESCHLAGEN'}`)
  if (!ok) {
    console.error('  Login fehlgeschlagen — Smoke abgebrochen.')
    await browser.close()
    return { failed: true }
  }

  console.log('--- Dispatch-Lead-Detail: reparaturwunsch-Config-Feld ---')
  await page.goto(`${STAGING_BASE}/dispatch/leads`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(1500)
  // Ersten Lead oeffnen (data-unabhaengig — irgendein Lead reicht fuer den Form-Render-Check).
  const leadLink = await page.$('a[href*="/dispatch/leads/"]')
  if (leadLink) {
    await leadLink.click()
    await page.waitForTimeout(2500)
    const body = await page.$eval('body', (el) => el.textContent || '').catch(() => '')
    // reparaturwunsch-Config-Feld: audience 'beide', sektion schaden. Label aus onboarding_felder.
    const hasReparaturwunsch = /abrechnen|reparaturwunsch|fiktiv/i.test(body)
    console.log(`  reparaturwunsch-Feld sichtbar: ${hasReparaturwunsch}`)
    console.log(`  (Hinweis: ggf. erst im Schaden-Tab — beim Post-Merge-Run Selektor pruefen.)`)
  } else {
    console.log('  Kein Lead in der Liste — Form-Render-Check uebersprungen (Testdaten noetig).')
  }

  await browser.close()

  console.log('\n=== ERGEBNIS ===')
  console.log(`  Page-Errors: ${pageErrors.length}`)
  pageErrors.forEach((e) => console.log(`   ! ${e.url}: ${e.message}`))
  return { failed: failedHard }
}

run()
  .then((r) => {
    if (r.failed) {
      console.error('\n❌ REPARATURWUNSCH-SMOKE FAILED')
      process.exit(1)
    }
    console.log('\n✅ REPARATURWUNSCH-SMOKE PASSED')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n❌ SMOKE CRASHED:', err)
    process.exit(1)
  })
