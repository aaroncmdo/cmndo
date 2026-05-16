// CMM-60 Schritt-2 UI-Smoke: SV-Portal gegen staging nach is_sv_for_claim-Rewrite.
// Login test-sv@claimondo.de -> /gutachter (Fall-Liste) + eine zugewiesene
// Fallakte. Prueft: keine 403/Kein-Zugriff, Fall-Liste gefuellt, keine pageerror.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, rmSync } from 'fs'

const BASE = 'https://app.staging.claimondo.de'
const OUT = 'docs/16.05.2026/cmm60-s2-sv-smoke'
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
console.log('   -> ' + page.url())

console.log('2. /gutachter — Fall-Liste …')
await page.goto(BASE + '/gutachter', { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: OUT + '/01-gutachter-liste.png', fullPage: true })
const listText = await page.locator('body').innerText()
const listDenied = /kein zugriff|nicht berechtigt|403|forbidden/i.test(listText)
console.log('   Liste — Zugriff verweigert?', listDenied)

console.log('3. /gutachter/fall/[id] — zugewiesene Fallakte …')
await page.goto(BASE + '/gutachter/fall/' + FALL_ID, { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: OUT + '/02-fallakte.png', fullPage: true })
const fallText = await page.locator('body').innerText()
const fallDenied = /kein zugriff|nicht berechtigt|403|forbidden|not found/i.test(fallText)
const fallHasNummer = fallText.includes('CLM-20260515-014')
console.log('   Fallakte — Zugriff verweigert?', fallDenied, '| Fall-Nummer sichtbar?', fallHasNummer)

await browser.close()

console.log('\n=== ERGEBNIS ===')
console.log('pageerrors/5xx:', errors.length)
const ok = errors.length === 0 && !listDenied && !fallDenied && fallHasNummer
console.log(ok ? 'SMOKE GRÜN' : 'SMOKE ROT')
process.exit(ok ? 0 : 1)
