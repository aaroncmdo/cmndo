#!/usr/bin/env node
/**
 * scripts/probe-lead-realtime-visibility.mjs
 *
 * Stufe 2 — Realtime-UI-Probe: Bekommt der Dispatcher den Lead AUTOMATISCH?
 *
 * Was hier passiert:
 *  1. Playwright startet einen Chromium-Browser.
 *  2. Dispatcher loggt sich ein und öffnet /dispatch/leads.
 *  3. Wir warten kurz, damit die Realtime-Subscription (RealtimeLeadAlert.tsx)
 *     aktiv ist und Screenshot „vor INSERT" gemacht ist.
 *  4. Service-Role legt im Hintergrund einen Lead an — semantisch identisch
 *     zu einem `/schaden-melden`-Submit aus User-Sicht des Dispatchers.
 *  5. Wir warten 8s und screenshotten „nach INSERT".
 *  6. Asserts: Toast „Neuer Lead: …" sichtbar / oder Lead in der Liste sichtbar
 *     (router.refresh() hat gefeuert).
 *  7. Cleanup: Service-Role löscht den Lead.
 *
 * Verwendung:
 *   node scripts/probe-lead-realtime-visibility.mjs                # gegen localhost
 *   BASE_URL=https://app.staging.claimondo.de \
 *     node scripts/probe-lead-realtime-visibility.mjs              # gegen Staging
 *
 * Exit-Codes: 0 = Realtime hat gefeuert, 1 = nicht gefeuert / Fehler.
 *
 * Screenshots: docs/<TS>/probe-lead-realtime/{vorher,nachher,toast?}.png
 */

import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

// ─── ENV laden ────────────────────────────────────────────────────────────
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()

const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FEHLER: .env.local braucht NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const DISPATCHER_EMAIL = 'test-dispatch@claimondo.de'
const DISPATCHER_PASSWORD = 'Test1234!'

const RUN_TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
// Output unter docs/probe-runs/ — gitignored (siehe .gitignore).
const OUT_DIR = join('docs', 'probe-runs', `lead-realtime-${RUN_TS}`)
mkdirSync(OUT_DIR, { recursive: true })

const MARKER = `ProbeLead-${Date.now()}`
const PROBE_LEAD = {
  vorname: MARKER,
  nachname: 'RealtimeVisibility',
  email: 'probe-realtime@claimondo.de',
  telefon: '+4915199990002',
  source_channel: 'probe-realtime-visibility',
  status: 'neu',
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let leadId = null

async function vorabAufraeumen() {
  const { error } = await svc.from('leads').delete().like('vorname', 'ProbeLead-%')
  if (error) console.warn(`[WARN] Vorab-Cleanup: ${error.message}`)
}

async function cleanup() {
  if (!leadId) return
  const { error } = await svc.from('leads').delete().eq('id', leadId)
  console.log(error ? `[WARN] Cleanup: ${error.message}` : `✓ Lead ${leadId} gelöscht`)
}

async function main() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  Probe: Lead-Realtime-Visibility (UI-Ebene)')
  console.log(`  BASE_URL: ${BASE_URL}`)
  console.log(`  Output:   ${OUT_DIR}`)
  console.log('═══════════════════════════════════════════════════\n')

  await vorabAufraeumen()

  const browser = await chromium.launch({ headless: process.env.HEADED !== '1' })
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  })
  // Sentry/Console-Errors mitschreiben
  ctx.on('weberror', (e) => console.log(`[WEBERROR] ${e.error().message}`))

  const page = await ctx.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[BROWSER-ERR] ${msg.text().slice(0, 200)}`)
  })

  // ─── Login als Dispatcher ───────────────────────────────────────────────
  console.log('→ Dispatcher login...')
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.locator('input[type="email"]').first().fill(DISPATCHER_EMAIL)
  await page.locator('input[type="password"]').first().fill(DISPATCHER_PASSWORD)
  await page.getByRole('button', { name: /anmelden|login|einloggen/i }).first().click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 }).catch(() => {})
  console.log(`✓ Eingeloggt, URL: ${page.url()}`)

  // ─── /dispatch/leads öffnen ─────────────────────────────────────────────
  await page.goto(`${BASE_URL}/dispatch/leads`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(3_500) // Realtime-Channel-Setup
  console.log(`✓ /dispatch/leads geladen, URL: ${page.url()}`)

  await page.screenshot({ path: join(OUT_DIR, '01-vor-insert.png'), fullPage: true })
  console.log(`📷 Screenshot: ${join(OUT_DIR, '01-vor-insert.png')}`)

  // Zähle aktuelle Leads in der UI (h3/h2/td) — schwer ohne stabile Test-IDs,
  // daher messen wir Rohzahl Lead-Liste vs. „Ergebnisse"-Label.
  const ergebnisseLabelVor = await page
    .locator('text=/\\d+ Ergebnisse/')
    .first()
    .textContent()
    .catch(() => null)
  console.log(`  Liste vor INSERT: "${ergebnisseLabelVor}"`)

  // ─── Probe-Lead über Service-Role anlegen ───────────────────────────────
  console.log(`\n→ Probe-Lead via Service-Role anlegen (Marker=${MARKER})...`)
  const { data, error } = await svc
    .from('leads')
    .insert(PROBE_LEAD)
    .select('id, created_at')
    .single()
  if (error || !data) {
    console.error(`[FEHLER] Insert: ${error?.message}`)
    await browser.close()
    process.exit(1)
  }
  leadId = data.id
  console.log(`✓ Insert OK: id=${leadId} created_at=${data.created_at}`)

  // ─── Auf Realtime-Effekt warten ────────────────────────────────────────
  console.log(`\n→ Warte 8s auf Realtime-Effekt (Toast + router.refresh)...`)
  await page.waitForTimeout(8_000)

  await page.screenshot({ path: join(OUT_DIR, '02-nach-insert.png'), fullPage: true })
  console.log(`📷 Screenshot: ${join(OUT_DIR, '02-nach-insert.png')}`)

  // ─── Asserts ───────────────────────────────────────────────────────────
  let toastVisible = false
  let listeContainsMarker = false

  // (a) Toast: 'sonner' rendert in [data-sonner-toaster] oder ähnlich
  const toastLoc = page.locator(`text=/Neuer Lead.*${MARKER.slice(0, 12)}|${MARKER}/i`).first()
  toastVisible = await toastLoc.isVisible({ timeout: 1_000 }).catch(() => false)
  if (!toastVisible) {
    // Sonner-Toasts könnten bereits gefadet sein nach 5s — fallback auf
    // Detection: Toaster-Container existiert + irgendein Toast war da
    const sonnerCount = await page.locator('[data-sonner-toaster] li, [class*="toast"]').count().catch(() => 0)
    if (sonnerCount > 0) {
      console.log(`  ℹ Sonner-Container hat ${sonnerCount} Toast(s) — vermutlich Marker schon verblasst`)
    }
  }
  console.log(`  Toast sichtbar mit Marker: ${toastVisible ? 'JA' : 'NEIN (oder schon weg)'}`)

  // (b) Lead-Liste: enthält Marker?
  const markerInListe = page.locator(`text=${MARKER}`).first()
  listeContainsMarker = await markerInListe.isVisible({ timeout: 2_000 }).catch(() => false)
  console.log(`  Marker in Lead-Liste sichtbar: ${listeContainsMarker ? 'JA' : 'NEIN'}`)

  // (c) Ergebnis-Counter erhöht?
  const ergebnisseLabelNach = await page
    .locator('text=/\\d+ Ergebnisse/')
    .first()
    .textContent()
    .catch(() => null)
  console.log(`  Liste nach INSERT: "${ergebnisseLabelNach}"`)
  const vorN = parseInt(ergebnisseLabelVor?.match(/\d+/)?.[0] ?? '0', 10)
  const nachN = parseInt(ergebnisseLabelNach?.match(/\d+/)?.[0] ?? '0', 10)
  const counterGestiegen = nachN > vorN
  console.log(`  Counter ${vorN} → ${nachN}: ${counterGestiegen ? '↑ JA' : '= NEIN'}`)

  // Toast-spezifischer Screenshot falls Toast noch da
  if (toastVisible) {
    await page.screenshot({ path: join(OUT_DIR, '03-toast.png'), fullPage: false })
    console.log(`📷 Screenshot: ${join(OUT_DIR, '03-toast.png')}`)
  }

  await browser.close()
  await cleanup()

  console.log('\n═══════════════════════════════════════════════════')
  console.log(`  Toast erkannt:     ${toastVisible ? '✓' : '✗ (kann gefadet sein)'}`)
  console.log(`  Marker in Liste:   ${listeContainsMarker ? '✓' : '✗'}`)
  console.log(`  Counter gestiegen: ${counterGestiegen ? '✓' : '✗'}`)
  const success = listeContainsMarker || counterGestiegen
  if (success) {
    console.log('  ERGEBNIS: ✓ Realtime hat gefeuert (Lead in der Liste nach router.refresh)')
    process.exit(0)
  } else {
    console.log('  ERGEBNIS: ✗ Realtime-Effekt NICHT bestätigt — Wire prüfen')
    process.exit(1)
  }
}

main().catch(async (err) => {
  console.error(`[CRASH] ${err.message}`)
  console.error(err.stack)
  await cleanup()
  process.exit(1)
})
