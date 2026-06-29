/**
 * drive-kunde-reschedule.mjs — E2E: Kunde verschiebt seinen SV-Termin
 *
 * Loggt sich als test-kunde ein, öffnet die Fallakte, klickt „Termin
 * verschieben" und reschedult den SV-Termin (Vorschlag-Pfad bevorzugt,
 * Wunschtermin-Pfad als Fallback). Screenshots before/after.
 *
 * Kunde-Reschedule = Sofort-Reschedule: neuer Slot wird direkt 'bestaetigt'
 * (kundeTerminVerlegungVorschlagen, „Kunde ist König"). Die Cross-Rollen-
 * Konsistenz wird separat per RLS-Simulation gegen get_aktueller_gt_termin_id
 * geprüft.
 *
 * Run:  node scripts/drive-kunde-reschedule.mjs
 * Out:  tmp/reschedule-before.png · tmp/reschedule-after.png
 */

import { createRequire } from 'module'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

function ladeEnv() {
  const envPath = join(projectRoot, '.env.local')
  if (!existsSync(envPath)) { console.error('[FEHLER] .env.local fehlt'); process.exit(1) }
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
if (!BASIC_PASS) { console.error('[FEHLER] STAGING_BASIC_AUTH_PASS fehlt'); process.exit(1) }

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')
const tmpDir = join(projectRoot, 'tmp')
if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

function nextWeekdayLocal(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86400000)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T14:00`
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    baseURL: BASE,
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    viewport: { width: 1280, height: 1400 },
  })
  const page = await context.newPage()

  // Login
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', KUNDE_EMAIL)
  await page.fill('input[type="password"], input[name="password"]', KUNDE_PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60_000 }).catch(() => {})

  // Fallakte
  await page.goto(`/kunde/faelle/${CLAIM_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(tmpDir, 'reschedule-before.png'), fullPage: true })

  // „Termin verschieben" öffnen
  const trigger = page.locator('button:has-text("Termin verschieben")').first()
  if (await trigger.count() === 0) { console.error('[FEHLER] kein "Termin verschieben"-Button'); await browser.close(); process.exit(1) }
  await trigger.click()
  await page.waitForTimeout(500)
  // Modal-Titel (h3)
  await page.locator('h3:has-text("Termin verschieben")').waitFor({ timeout: 10_000 }).catch(() => {})

  // Vorschläge laden lassen (oder keineVorschlaege)
  await page.waitForTimeout(4000)

  let gewaehlt = 'keiner'
  const vorschlag1 = page.locator('button:has-text("Vorschlag 1")')
  if (await vorschlag1.count() > 0) {
    await vorschlag1.first().click()
    gewaehlt = 'Vorschlag 1'
    await page.locator('button:has-text("Vorschlag senden")').first().click()
  } else {
    // Wunschtermin-Pfad
    await page.locator('button:has-text("Anderen Termin wählen")').first().click()
    await page.waitForTimeout(400)
    const wunsch = nextWeekdayLocal(9)
    gewaehlt = `Wunschtermin ${wunsch}`
    await page.locator('input[type="datetime-local"]').fill(wunsch)
    await page.locator('button:has-text("Termin prüfen")').first().click()
    await page.waitForTimeout(2500)
    // Falls „belegt" → erste Alternative
    const altSenden = page.locator('button:has-text("Alternativ-Vorschlag senden")')
    const altCard = page.locator('button:has-text("früher"), button:has-text("später"), button:has-text("+1")')
    if (await altCard.count() > 0) {
      await altCard.first().click()
      gewaehlt += ' -> Alternative'
      if (await altSenden.count() > 0) await altSenden.first().click()
    }
  }
  console.log(`[reschedule] gewählt: ${gewaehlt}`)

  // Auf Submit + Modal-Close warten
  await page.waitForTimeout(4000)
  await page.locator('h3:has-text("Termin verschieben")').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})

  // Fallakte neu laden + After-Screenshot
  await page.goto(`/kunde/faelle/${CLAIM_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1500)
  const html = await page.content()
  const verschiebenDa = /Termin verschieben/.test(html)
  await page.screenshot({ path: join(tmpDir, 'reschedule-after.png'), fullPage: true })
  console.log(`[reschedule] Fallakte nach Reschedule -> "Termin verschieben"-Button noch da=${verschiebenDa}`)

  await browser.close()
  console.log('[reschedule] FERTIG -> tmp/reschedule-before.png · tmp/reschedule-after.png')
}

main().catch(e => { console.error('[KRITISCH]', e?.message ?? e); process.exit(1) })
