/**
 * Smoke: P2d-4 v2-Dispatcher-Sidebar + Section-Panels.
 *   BASE_URL=http://localhost:3077 node scripts/smoke-p2d4-sidebar.mjs
 * Env: BASE_URL (default staging), LEAD_ID.
 * Prueft: Sidebar-Widgets (Gespraechshilfe/Einwaende/KundenMatch/Rueckruf/Termine),
 * schaden-Panel (BKAT, KEIN Auto-Fire), fahrzeug-Panel (Cardentity + Eigentuemer-Typ),
 * sticky beim Scrollen. Screenshots + Marker + Console-Errors.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'

const BASE = process.env.BASE_URL || 'https://app.staging.claimondo.de'
const LEAD = process.env.LEAD_ID || 'c1964512-23af-4973-bf37-ff62d80599d5'
const isLocal = BASE.includes('localhost') || BASE.includes('127.0.0.1')
const OUT = 'docs/03.06.2026/smoke-p2d4-sidebar'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({
  ...(isLocal ? {} : { httpCredentials: { username: 'aaroncmdo', password: 'ClaimondoSuperuser123789!!' } }),
  viewport: { width: 1440, height: 1700 },
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
})
const page = await context.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()) })
page.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message))

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.fill('input[type="email"], input[name="email"], #email', 'test-dispatch@claimondo.de')
  await page.fill('input[type="password"], input[name="password"], #password', (process.env.TEST_PASSWORT ?? ''))
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {})
  console.log('after-login:', page.url())

  // NO_V2=1 testet den Default-Pfad OHNE ?v2 (nach dem P3b-Cutover ist v2 Default).
  const url = `${BASE}/dispatch/leads/${LEAD}${process.env.NO_V2 === '1' ? '' : '?v2'}`
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  console.log('?v2 HTTP', resp?.status(), 'final', page.url())
  // Cold-dev-compile: auf einen Sidebar-Marker warten
  await page.waitForFunction(
    () => document.body.innerText.includes('Einwand-Karten') || document.body.innerText.includes('Fahrzeug-Eigentümer'),
    { timeout: 90000 },
  ).catch(() => console.log('WARN: sidebar marker not found within timeout'))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(OUT, '01-top.png') }) // viewport (Layout + Sidebar oben)
  await page.screenshot({ path: join(OUT, '02-full.png'), fullPage: true })

  const body = await page.locator('body').innerText().catch(() => '')
  const markers = {
    form_v2: body.includes('config-getrieben') || body.includes('Lead-Erfassung'),
    sidebar_gespraechshilfe: body.includes('Closing — am Gesprächsende') || body.includes('Disqualifikation — Gesprächsabschluss'),
    sidebar_einwand: body.includes('Einwand-Karten'),
    sidebar_kundenmatch: body.includes('Bestehender Kunde?'),
    sidebar_rueckruf: body.includes('Rückruf / Anruf-Historie'),
    sidebar_termine: body.includes('Termine zum Lead'),
    schaden_bkat_panel: body.includes('KI-Klassifikation'),
    bkat_manual_button: body.includes('Analysieren'),
    bkat_NO_autofire: !body.includes('Analysiere …') && !body.includes('Analysiere Unfallhergang'),
    fahrzeug_cardentity: body.includes('Cardentity'),
    fahrzeug_eigentuemer: body.includes('Fahrzeug-Eigentümer'),
  }
  console.log('MARKERS', JSON.stringify(markers, null, 2))

  // Sticky-Check: Layout-Scroll-Container nach unten scrollen, Sidebar muss sichtbar bleiben
  await page.evaluate(() => {
    const m = document.getElementById('main-content')
    if (m) m.scrollTop = 900
    else window.scrollTo(0, 900)
  })
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(OUT, '03-scrolled-sticky.png') })

  console.log('ERRORS:', errs.length ? errs.slice(0, 10).join(' || ') : 'none')
} catch (e) {
  console.log('SMOKE EXCEPTION:', e.message)
  await page.screenshot({ path: join(OUT, '99-error.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}
