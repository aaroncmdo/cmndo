/**
 * visual-verify-kunde-termin.mjs — Screenshot-Beweis: Kunde sieht den SV-Termin
 *
 * Pendant zu seed-kunde-termin-fixture.mjs. Loggt sich als test-kunde auf
 * app.staging.claimondo.de ein und fotografiert /kunde/termine + die Fallakte.
 * Belegt visuell, dass der claim-nativ verknüpfte Termin (fall_id == claim_id)
 * im Kunde-Portal erscheint (vorher: „keine Termine geplant").
 *
 * Secrets kommen zur Laufzeit aus .env.local (STAGING_BASIC_AUTH_USER/PASS) —
 * nie hartkodiert. Login-Muster gespiegelt aus tests/e2e/kunde-auth-setup.spec.ts.
 *
 * Run:  node scripts/visual-verify-kunde-termin.mjs
 * Out:  tmp/kunde-termine.png · tmp/kunde-fallakte.png
 */

import { createRequire } from 'module'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

function ladeEnv() {
  const envPath = join(projectRoot, '.env.local')
  if (!existsSync(envPath)) { console.error('[FEHLER] .env.local nicht gefunden'); process.exit(1) }
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
}
ladeEnv()

const BASE = process.env.STAGING_APP_URL ?? 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER ?? 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS ?? ''
const KUNDE_EMAIL = process.env.TEST_KUNDE_EMAIL ?? 'test-kunde@claimondo.de'
const KUNDE_PASS = process.env.TEST_KUNDE_PASSWORD ?? 'Claimondo-Smoke-2026!'
const CLAIM_ID = process.env.KUNDE_CLAIM_ID ?? 'cccc5555-0000-4000-8000-000000000050'

if (!BASIC_PASS) { console.error('[FEHLER] STAGING_BASIC_AUTH_PASS nicht in .env.local'); process.exit(1) }

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const tmpDir = join(projectRoot, 'tmp')
if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    baseURL: BASE,
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    viewport: { width: 1280, height: 1400 },
  })
  const page = await context.newPage()

  // 1. Login (Muster aus kunde-auth-setup.spec.ts)
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', KUNDE_EMAIL)
  await page.fill('input[type="password"], input[name="password"]', KUNDE_PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60_000 }).catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
  console.log(`[visual] nach Login gelandet: ${page.url()}`)

  // 2. /kunde/termine
  await page.goto('/kunde/termine', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1500)
  const termineHtml = await page.content()
  // Screenshot = Quelle der Wahrheit. Positiv-Signal = die Termin-Karte; das "keine Termine
  // geplant"-Empty-State steht ZUSÄTZLICH in der versteckten Kalender-View-DOM (False-Positive-Falle).
  const terminKarteSichtbar = /Gutachter-Termin|Details öffnen/.test(termineHtml)
  await page.screenshot({ path: join(tmpDir, 'kunde-termine.png'), fullPage: true })
  console.log(`[visual] /kunde/termine -> Termin-Karte sichtbar=${terminKarteSichtbar}`)

  // 3. Fallakte
  await page.goto(`/kunde/faelle/${CLAIM_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1500)
  const fallakteHtml = await page.content()
  const verschiebenSichtbar = /Termin verschieben/.test(fallakteHtml)
  await page.screenshot({ path: join(tmpDir, 'kunde-fallakte.png'), fullPage: true })
  console.log(`[visual] Fallakte: ${page.url()} -> "Termin verschieben"-Button sichtbar=${verschiebenSichtbar}`)

  await browser.close()
  console.log('[visual] FERTIG -> tmp/kunde-termine.png · tmp/kunde-fallakte.png')
  console.log(`[visual] Beweis: Termin-Karte + "Termin verschieben" sichtbar = fall_id-Linkage + aktive Geschädigten-Party (is_claim_user_party) gefixt.`)
}

main().catch(e => { console.error('[KRITISCH]', e?.message ?? e); process.exit(1) })
