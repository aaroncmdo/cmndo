/**
 * scripts/smoke-dispatch-zb1-audience.mjs
 *
 * P2e (re-scoped): Verifiziert dass das zb1-upload-Foto-Feld nach der Migration
 * 20260602072035 (audience 'beide'->'kunde') im Dispatcher-Renderer
 * (DispatchLeadForm, ?v2) NICHT mehr erscheint, waehrend die Sektion
 * "Fahrzeug & Halter" + das manuelle Kennzeichen-Feld erhalten bleiben.
 *
 * Verwendung:  node scripts/smoke-dispatch-zb1-audience.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = join(__dirname, '..', 'docs', '02.06.2026', 'smoke-dispatch-v2-zb1')
mkdirSync(SHOT_DIR, { recursive: true })

const BASE = 'https://app.staging.claimondo.de'
const BASIC_AUTH = { username: 'aaroncmdo', password: 'ClaimondoSuperuser123789!!' }
const DISPATCH = { email: 'test-dispatch@claimondo.de', password: (process.env.TEST_PASSWORT ?? '') }
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, httpCredentials: BASIC_AUTH, ignoreHTTPSErrors: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })

let pass = true
try {
  if (!(await loginWithRetry(page))) throw new Error('Login nach Retries fehlgeschlagen (Staging instabil)')
  out(`LOGIN ok -> ${page.url()}`)

  await page.goto(`${BASE}/dispatch/leads/${LEAD_ID}?v2`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('details', { timeout: 30_000 })
  // Lazy/hydration: durch die Seite scrollen damit alle Sektionen sicher im DOM sind
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)) }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(800)

  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')

  // Fahrzeug-Sektion gezielt isolieren (summary enthaelt "Halter")
  const det = page.locator('details', { has: page.locator('summary', { hasText: 'Halter' }) }).first()
  let detText = ''
  if (await det.count()) {
    await det.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    detText = (await det.innerText()).replace(/\s+/g, ' ')
    await det.screenshot({ path: join(SHOT_DIR, '02-fahrzeug-halter-sektion.png') })
    out(`FAHRZEUG-SEKTION: ${detText.slice(0, 500)}`)
  } else {
    out('!! Fahrzeug-&-Halter-Sektion nicht gefunden')
  }

  // Labels werden per CSS uppercase gerendert -> case-insensitiv vergleichen.
  const lc = body.toLowerCase()
  const dlc = detText.toLowerCase()
  const checks = {
    'v2-Form gerendert ("config-getrieben")':        lc.includes('config-getrieben'),
    'Sektion "Fahrzeug & Halter" vorhanden':          detText.length > 0,
    'Manuelles Kennzeichen-Feld in der Sektion':      dlc.includes('kennzeichen'),
    'Manuelle Marke/Modell-Felder in der Sektion':    dlc.includes('marke') && dlc.includes('modell'),
    'KEIN ZB1-Foto-Feld in der Sektion':              !dlc.includes('fahrzeugschein'),
    'KEIN "Upload-Token fehlt" auf der Seite':        !lc.includes('upload-token'),
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
out(pass ? 'SMOKE_RESULT=PASS' : 'SMOKE_RESULT=FAIL')
await ctx.close()
await browser.close()
process.exit(pass ? 0 : 1)
