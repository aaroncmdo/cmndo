/**
 * scripts/smoke-dispatch-v2-termin.mjs
 *
 * P2d-1 post-merge smoke: im flachen Dispatcher-Form (?v2) rendert die Sektion
 * "Termin & Besichtigung" jetzt SvDispatchPanel statt TerminField (das ohne
 * token "Link ungültig" zeigte). Druckt DEPLOYED/NOT_DEPLOYED damit der Lauf
 * auch als Deploy-Detektor taugt.
 *
 * node scripts/smoke-dispatch-v2-termin.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = join(__dirname, '..', 'docs', '02.06.2026', 'smoke-dispatch-v2-termin')
mkdirSync(SHOT_DIR, { recursive: true })

const BASE = 'https://app.staging.claimondo.de'
const BASIC_AUTH = { username: 'aaroncmdo', password: 'ClaimondoSuperuser123789!!' }
const DISPATCH = { email: 'test-dispatch@claimondo.de', password: 'Test1234!' }
const LEAD_ID = 'c1964512-23af-4973-bf37-ff62d80599d5'
const out = (m) => console.log(m)

async function loginWithRetry(page, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.fill('input[name="email"]', DISPATCH.email)
      await page.fill('input[name="password"]', DISPATCH.password)
      await page.click('button[type="submit"]')
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45_000 })
      return true
    } catch (e) {
      out(`  login attempt ${i}/${tries} failed: ${e.message.split('\n')[0]}`)
      await page.waitForTimeout(4000)
    }
  }
  return false
}

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, httpCredentials: BASIC_AUTH, ignoreHTTPSErrors: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })

let pass = true
let deployed = false
try {
  if (!(await loginWithRetry(page))) throw new Error('Login nach Retries fehlgeschlagen (Staging instabil)')
  out(`LOGIN ok -> ${page.url()}`)

  await page.goto(`${BASE}/dispatch/leads/${LEAD_ID}?v2`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('details', { timeout: 30_000 })
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)) }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(1500)

  const det = page.locator('details', { has: page.locator('summary', { hasText: 'Besichtigung' }) }).first()
  let detText = ''
  if (await det.count()) {
    await det.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    detText = (await det.innerText()).replace(/\s+/g, ' ')
    await det.screenshot({ path: join(SHOT_DIR, '02-termin-sektion.png') })
    out(`TERMIN-SEKTION: ${detText.slice(0, 600)}`)
  } else {
    out('!! Termin & Besichtigung-Sektion nicht gefunden')
    pass = false
  }
  const dlc = detText.toLowerCase()

  // Deploy-Detektor: altes TerminField zeigt "Dieser Link ist nicht mehr gültig".
  const hatTerminFieldFehler = dlc.includes('nicht mehr gültig') || dlc.includes('dieser link')
  deployed = detText.length > 0 && !hatTerminFieldFehler
  out(deployed ? 'DEPLOY=DEPLOYED (TerminField-Platzhalter weg)' : 'DEPLOY=NOT_DEPLOYED (altes TerminField aktiv)')

  const checks = {
    'v2-Form gerendert ("config-getrieben")':            (await page.locator('body').innerText()).includes('config-getrieben'),
    'Termin & Besichtigung-Sektion vorhanden':            detText.length > 0,
    'KEIN TerminField-Fehler ("nicht mehr gültig" weg)':  !hatTerminFieldFehler,
    'SvDispatchPanel-Inhalt sichtbar':                    /reservieren|sachverständ|gutachter|schuldfrage|abgelehnt|gegenvorschlag/.test(dlc),
    'keine Console-Errors':                               errors.length === 0,
  }
  for (const [k, v] of Object.entries(checks)) { out(`${v ? 'PASS' : 'FAIL'}  ${k}`); if (!v) pass = false }

  await page.screenshot({ path: join(SHOT_DIR, '01-dispatch-v2-fullpage.png'), fullPage: true })
} catch (e) {
  pass = false
  out(`ERROR: ${e.message}`)
  await page.screenshot({ path: join(SHOT_DIR, '99-error.png'), fullPage: true }).catch(() => {})
}

out(`console/page errors: ${errors.length}`)
errors.slice(0, 12).forEach(out)
out(`SMOKE_RESULT=${pass ? 'PASS' : 'FAIL'}`)
out(`DEPLOY_STATE=${deployed ? 'DEPLOYED' : 'NOT_DEPLOYED'}`)
await ctx.close()
await browser.close()
process.exit(pass ? 0 : 1)
