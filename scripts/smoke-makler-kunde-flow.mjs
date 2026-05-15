// 15.05.2026: E2E-Smoke Makler→Kunde via Promo-Code.
// Voraussetzung: promotion_codes hat einen aktiven Code SMOKE-MK-TEST für
// test-makler@claimondo.de (in der DB-Seed-Phase angelegt).
//
// Schritte:
//   1) Login als test-makler → /makler/promo → Promo-Code sichtbar?
//   2) Anonym → /schaden-melden?p=SMOKE-MK-TEST → Mini-Wizard ausfüllen
//   3) Submit → link-versendet-Page (Magic-Link gesendet)
//   4) Screenshot Makler-Leads-Liste post-submit (zeigt neuen Lead?)
//
// Output: docs/15.05.2026/smoke-makler-kunde/<step>.png + audit-summary.json

import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = process.env.SMOKE_BASE_URL ?? 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_PASS ?? ''
// Promo-Code muss Regex `MK-[A-Z0-9]{4}` matchen (isValidPromoCodeFormat).
const PROMO_CODE = process.env.PROMO_CODE ?? 'MK-SMKE'
const MAKLER_EMAIL = 'test-makler@claimondo.de'
const PASSWORD = 'Test1234!'
const OUT = 'docs/15.05.2026/smoke-makler-kunde'

const RUN_ID = Date.now().toString(36)
// Telefon muss numerisch sein (Zod-Validation lehnt Buchstaben ab — DE-Mobile E.164)
const PHONE_SUFFIX = String(Date.now()).slice(-6)
const KUNDE_EMAIL = `kunde-smoke-${RUN_ID}@example.com`
const KUNDE_TELEFON = `+49170${PHONE_SUFFIX}`
const KUNDE_VORNAME = 'SmokeTest'
const KUNDE_NACHNAME = `Run-${RUN_ID}`

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const issues = []
const events = []
function evt(label, data) {
  console.log(`[${label}]`, typeof data === 'object' ? JSON.stringify(data) : data)
  events.push({ label, data, ts: new Date().toISOString() })
}

// 15.05.2026: headless:true damit ein User-Window-Close nicht den Smoke crasht
const browser = await chromium.launch({ headless: true })

// ========== Step 1: Makler-Sicht ==========
const maklerCtx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  httpCredentials: BASIC_PASS ? { username: BASIC_USER, password: BASIC_PASS } : undefined,
})
const maklerPage = await maklerCtx.newPage()
maklerPage.on('pageerror', (e) =>
  issues.push({ scope: 'makler', type: 'pageerror', msg: e.message })
)

evt('makler-login', { email: MAKLER_EMAIL })
await maklerPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await maklerPage.fill('input[type="email"], input[name="email"]', MAKLER_EMAIL).catch(() => {})
await maklerPage.fill('input[type="password"], input[name="password"]', PASSWORD).catch(() => {})
await maklerPage.click('button[type="submit"]').catch(() => {})
await maklerPage.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 }).catch(() => {})
evt('makler-post-login-url', maklerPage.url())

await maklerPage.goto(`${BASE}/makler/promo`, { waitUntil: 'networkidle', timeout: 30000 })
await maklerPage.waitForTimeout(1500)
await maklerPage.screenshot({ path: join(OUT, '01-makler-promo.png'), fullPage: true })
const promoBodyText = await maklerPage.locator('body').innerText().catch(() => '')
const codeFound = promoBodyText.includes(PROMO_CODE)
evt('makler-promo-code-visible', codeFound ? PROMO_CODE : '(nicht gefunden)')
if (!codeFound) issues.push({ scope: 'makler', type: 'promo-code-missing', code: PROMO_CODE })

// Snapshot Makler-Leads BEFORE
await maklerPage.goto(`${BASE}/makler/leads`, { waitUntil: 'networkidle', timeout: 30000 })
await maklerPage.waitForTimeout(1500)
await maklerPage.screenshot({ path: join(OUT, '02-makler-leads-before.png'), fullPage: true })
const leadsBeforeText = (await maklerPage.locator('body').innerText().catch(() => '')).slice(0, 2000)
evt('makler-leads-before-snippet', leadsBeforeText.slice(0, 300))

// ========== Step 2: Anonymous → Mini-Wizard ==========
const kundeCtx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  httpCredentials: BASIC_PASS ? { username: BASIC_USER, password: BASIC_PASS } : undefined,
})
const kundePage = await kundeCtx.newPage()
kundePage.on('pageerror', (e) =>
  issues.push({ scope: 'kunde', type: 'pageerror', msg: e.message })
)

evt('kunde-goto', `${BASE}/schaden-melden?p=${PROMO_CODE}`)
await kundePage.goto(`${BASE}/schaden-melden?p=${PROMO_CODE}`, {
  waitUntil: 'networkidle',
  timeout: 30000,
})
await kundePage.waitForTimeout(1500)
await kundePage.screenshot({ path: join(OUT, '03-mini-wizard-empty.png'), fullPage: true })

// Form ausfüllen: schuldfrage=gegner ist Default, also reicht Datum+Ort+Kontakt+Consent
await kundePage.fill('#unfallort', 'Hauptstraße 12, Köln').catch(() => {})
await kundePage.fill('#vorname', KUNDE_VORNAME).catch(() => {})
await kundePage.fill('#nachname', KUNDE_NACHNAME).catch(() => {})
await kundePage.fill('input[name="email"]', KUNDE_EMAIL).catch(() => {})
await kundePage.fill('input[name="telefon"]', KUNDE_TELEFON).catch(() => {})
// dsgvo_consent: shadcn-Checkbox = <button role="checkbox">, nicht <input>
// Robuster: per Label-Text klicken (das ist immer ein Wrapper-<label>)
await kundePage
  .locator('label:has-text("Datenschutzerklärung"), label:has-text("Ich willige ein")')
  .first()
  .click()
  .catch(() => {})
// Fallback: button role checkbox
await kundePage
  .locator('button[role="checkbox"]')
  .first()
  .click({ trial: true })
  .then(() => kundePage.locator('button[role="checkbox"]').first().click())
  .catch(() => {})
await kundePage.waitForTimeout(500)
await kundePage.screenshot({ path: join(OUT, '04-mini-wizard-filled.png'), fullPage: true })

// Submit
evt('kunde-submit', { email: KUNDE_EMAIL })
await kundePage.click('button[type="submit"]').catch((e) =>
  issues.push({ scope: 'kunde', type: 'submit-fail', msg: e.message }),
)
await kundePage
  .waitForURL((u) => u.pathname.includes('link-versendet') || u.pathname.includes('selbstverschulden'), {
    timeout: 90000,
  })
  .catch(() => {})
await kundePage.waitForTimeout(3000)
await kundePage.screenshot({ path: join(OUT, '05-post-submit.png'), fullPage: true })
evt('kunde-post-submit-url', kundePage.url())

// ========== Step 3: Makler-Leads-Liste refresh ==========
await maklerPage.reload({ waitUntil: 'networkidle' }).catch(() => {})
await maklerPage.waitForTimeout(2000)
await maklerPage.screenshot({ path: join(OUT, '06-makler-leads-after.png'), fullPage: true })
const leadsAfterText = (await maklerPage.locator('body').innerText().catch(() => '')).slice(0, 2000)
const leadFoundInList =
  leadsAfterText.includes(KUNDE_NACHNAME) || leadsAfterText.includes(KUNDE_VORNAME)
evt('makler-leads-after-snippet', leadsAfterText.slice(0, 300))
evt('lead-in-makler-list', leadFoundInList ? 'JA' : 'NEIN')
if (!leadFoundInList) issues.push({ scope: 'makler', type: 'lead-not-in-list', kunde: KUNDE_NACHNAME })

await browser.close()

const summary = {
  base: BASE,
  promo_code: PROMO_CODE,
  run_id: RUN_ID,
  kunde: { email: KUNDE_EMAIL, vorname: KUNDE_VORNAME, nachname: KUNDE_NACHNAME, telefon: KUNDE_TELEFON },
  totalIssues: issues.length,
  issues,
  events,
  timestamp: new Date().toISOString(),
}
writeFileSync(join(OUT, 'smoke-summary.json'), JSON.stringify(summary, null, 2))
console.log(`\nSummary in ${join(OUT, 'smoke-summary.json')}`)
console.log(`Run-ID: ${RUN_ID}  Kunde: ${KUNDE_NACHNAME}`)
