/**
 * Smoke: /dispatch/leads/<id>?v2 (DispatchLeadForm) auf staging.
 *   node scripts/smoke-dispatch-v2-staging.mjs
 * Env: BASE_URL (default staging), LEAD_ID, DO_AUTOSAVE=1 (P2b-Autosave testen).
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'

const BASE = process.env.BASE_URL || 'https://app.staging.claimondo.de'
const LEAD = process.env.LEAD_ID || 'c1964512-23af-4973-bf37-ff62d80599d5'
const DO_AUTOSAVE = process.env.DO_AUTOSAVE === '1'
const OUT = 'docs/02.06.2026/smoke-dispatch-v2'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({
  httpCredentials: { username: 'aaroncmdo', password: 'ClaimondoSuperuser123789!!' },
  viewport: { width: 1440, height: 1700 },
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
})
await context.addCookies([{
  name: 'claimondo-cookie-consent', value: 'true',
  domain: 'app.staging.claimondo.de', path: '/',
  expires: Math.floor(Date.now() / 1000) + 31536000, httpOnly: false, secure: true, sameSite: 'Lax',
}])
const page = await context.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()) })
page.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message))

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.fill('input[type="email"], input[name="email"], #email', 'test-dispatch@claimondo.de')
  await page.fill('input[type="password"], input[name="password"], #password', (process.env.TEST_PASSWORT ?? ''))
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {})
  console.log('after-login:', page.url())

  const url = `${BASE}/dispatch/leads/${LEAD}?v2`
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  console.log('?v2 HTTP', resp?.status(), 'final', page.url())
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(OUT, 'p2-v2-render.png'), fullPage: true })

  const body = await page.locator('body').innerText().catch(() => '')
  const markers = {
    configGetrieben: body.includes('config-getrieben'),
    autosaveAktiv: body.includes('Autosave aktiv'),
    sektionKontakt: body.includes('Kontakt & Erreichbarkeit'),
    sektionFahrzeug: body.includes('Fahrzeug & Halter'),
    sektionStatus: body.includes('Status & Triage'),
    altPhaseUI: body.includes('Gesprächsleitfaden') || body.includes('Disqualifizieren'),
  }
  console.log('MARKERS', JSON.stringify(markers))

  if (DO_AUTOSAVE && markers.autosaveAktiv) {
    // Notiz-Feld (textarea, sektion kontakt) tippen -> Autosave abwarten
    const ta = page.locator('textarea').first()
    await ta.click()
    const stamp = 'smoke ' + new Date().toISOString().slice(11, 19)
    await ta.fill(stamp)
    await page.waitForTimeout(1500)
    const saved = body.includes('Gespeichert') || (await page.locator('text=Gespeichert').count().catch(() => 0)) > 0
    console.log('AUTOSAVE typed:', stamp, '-> saved-indicator:', saved)
    await page.screenshot({ path: join(OUT, 'p2-v2-autosave.png'), fullPage: true })
  }

  console.log('ERRORS:', errs.length ? errs.slice(0, 8).join(' || ') : 'none')
} catch (e) {
  console.log('SMOKE EXCEPTION:', e.message)
  await page.screenshot({ path: join(OUT, 'p2-v2-error.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}
