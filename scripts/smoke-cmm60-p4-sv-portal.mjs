// CMM-60 Phase-4 UI-Smoke: SV-Portal gegen staging nach der claims-Closure.
// Login test-sv@claimondo.de -> /gutachter, /heute, Fallakte, /kalender.
// Prueft: keine 403/leeren Listen/pageerrors.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, rmSync } from 'fs'

const BASE = 'https://app.staging.claimondo.de'
const OUT = 'docs/16.05.2026/cmm60-p4-sv-smoke'
const EMAIL = 'test-sv@claimondo.de'
const PW = 'Test1234!'
const FALL_ID = '33bf8685-6941-426c-b16b-3e29b1255000' // CLM-20260515-014, test-sv zugewiesen
const BASIC = { username: process.env.STAGING_BASIC_AUTH_USER, password: process.env.STAGING_BASIC_AUTH_PASS }

if (!BASIC.username || !BASIC.password) {
  console.error('FEHLER: STAGING_BASIC_AUTH_USER + STAGING_BASIC_AUTH_PASS fehlen.')
  process.exit(1)
}
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ httpCredentials: BASIC, viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'claimondo-cookie-consent', value: 'true', domain: 'app.staging.claimondo.de', path: '/' }])
const page = await ctx.newPage()
page.on('pageerror', e => { errors.push('PAGE-ERROR: ' + e.message); console.log('PAGE-ERROR:', e.message) })
page.on('response', r => { if (r.status() >= 500) { errors.push(`HTTP ${r.status()} ${r.url()}`); console.log('HTTP', r.status(), r.url()) } })

console.log('1. Login …')
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.fill('input[name="email"], input[type="email"]', EMAIL)
await page.fill('input[name="password"], input[type="password"]', PW)
await Promise.all([
  page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 60000 }),
  page.click('button[type="submit"]'),
])

const routes = [
  ['gutachter', '/gutachter'],
  ['heute', '/gutachter/heute'],
  ['fallakte', '/gutachter/fall/' + FALL_ID],
  ['kalender', '/gutachter/kalender'],
]
let denied = false
for (const [name, route] of routes) {
  console.log('2. ' + route + ' …')
  await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  const txt = await page.locator('body').innerText()
  if (/kein zugriff|nicht berechtigt|403|forbidden/i.test(txt)) {
    denied = true
    console.log('   ZUGRIFF VERWEIGERT auf ' + route)
  }
}

await browser.close()
console.log('\n=== ERGEBNIS ===')
console.log('pageerrors/5xx:', errors.length, '| denied:', denied)
const ok = errors.length === 0 && !denied
console.log(ok ? 'SMOKE GRÜN' : 'SMOKE ROT')
process.exit(ok ? 0 : 1)
