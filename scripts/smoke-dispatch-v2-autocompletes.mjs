/**
 * scripts/smoke-dispatch-v2-autocompletes.mjs
 *
 * P2d-2 post-merge smoke: im ?v2-Dispatcher-Form rendern gegner_versicherung,
 * besichtigungsort_adresse, unfallort als Autocomplete-Override statt TextField.
 * Deploy-Detektor: das generische TextField rendert data-testid="feld-<key>",
 * das Override NICHT -> Abwesenheit der 3 testids == deployed.
 *
 * node scripts/smoke-dispatch-v2-autocompletes.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = join(__dirname, '..', 'docs', '02.06.2026', 'smoke-dispatch-v2-autocompletes')
mkdirSync(SHOT_DIR, { recursive: true })

const BASE = 'https://app.staging.claimondo.de'
const BASIC_AUTH = { username: 'aaroncmdo', password: 'ClaimondoSuperuser123789!!' }
const DISPATCH = { email: 'test-dispatch@claimondo.de', password: 'Test1234!' }
const LEAD_ID = 'c1964512-23af-4973-bf37-ff62d80599d5'
const OVERRIDE_KEYS = ['gegner_versicherung', 'besichtigungsort_adresse', 'unfallort']
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 }, httpCredentials: BASIC_AUTH, ignoreHTTPSErrors: true })
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
  await page.waitForTimeout(2000)

  // Deploy-Detektor: kein TextField-testid mehr fuer die 3 Override-Keys.
  const stillTextField = []
  for (const k of OVERRIDE_KEYS) {
    if ((await page.locator(`[data-testid="feld-${k}"]`).count()) > 0) stillTextField.push(k)
  }
  deployed = stillTextField.length === 0
  out(deployed ? 'DEPLOY=DEPLOYED (alle 3 Override aktiv)' : `DEPLOY=NOT_DEPLOYED (noch TextField: ${stillTextField.join(',')})`)

  const body = (await page.locator('body').innerText())
  const checks = {
    'v2-Form gerendert ("config-getrieben")':              body.includes('config-getrieben'),
    'gegner_versicherung kein TextField mehr':             (await page.locator('[data-testid="feld-gegner_versicherung"]').count()) === 0,
    'besichtigungsort_adresse kein TextField mehr':        (await page.locator('[data-testid="feld-besichtigungsort_adresse"]').count()) === 0,
    'unfallort kein TextField mehr':                       (await page.locator('[data-testid="feld-unfallort"]').count()) === 0,
    'keine Console-Errors (kein Render-Crash)':            errors.length === 0,
  }
  for (const [k, v] of Object.entries(checks)) { out(`${v ? 'PASS' : 'FAIL'}  ${k}`); if (!v) pass = false }

  // Sektion-Screenshots (Unfallhergang = unfallort+gegner_versicherung; Termin = besichtigungsort)
  for (const [name, file] of [['Unfallhergang', '01-unfall-sektion.png'], ['Besichtigung', '02-besichtigung-sektion.png']]) {
    const det = page.locator('details', { has: page.locator('summary', { hasText: name }) }).first()
    if (await det.count()) { await det.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await det.screenshot({ path: join(SHOT_DIR, file) }) }
  }
  await page.screenshot({ path: join(SHOT_DIR, '00-fullpage.png'), fullPage: true })
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
