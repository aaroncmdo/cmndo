#!/usr/bin/env node
/**
 * Regel-4-Smoke: Fahrzeugschein-Upload im Kunde-Onboarding (prod).
 *
 * SOLL (Fachlogik, nicht aus dem Code gelesen): Der Kunde laedt den Fahrzeugschein hoch.
 * Kommt er spaeter zurueck, wird er NICHT erneut danach gefragt — der Upload ist sein
 * eigener Nachweis, unabhaengig davon, wohin die Extraktion schreibt.
 *
 * Deckt drei am 28.08. gemessene Fehler ab (PR #5705):
 *   1. Der OCR-Zweig legte kein `fall_dokumente` an  -> Wizard fragte ewig erneut
 *   2. Ein 1-MB-Foto sprengte die Server-Action (HTTP 500, React-Flight-Serialisierer)
 *   3. `handleFile` ohne try/catch -> UI blieb dauerhaft auf „Foto wird ausgewertet …"
 *
 * ⚠ Voraussetzung, die der Smoke selbst prueft: die Fahrzeug-Phase muss offen sein.
 * Traegt der Lead ein `kennzeichen`, ueberspringt der Loader sie ueber den Ersatz-Lookup —
 * der Lauf waere dann gruen, OHNE den Fix zu beruehren.
 *
 * Aufruf:
 *   node --env-file=.env.local scripts/smoke/zb1-upload-smoke.mjs            # seed + walk
 *   node --env-file=.env.local scripts/smoke/zb1-upload-smoke.mjs --gross    # mit 1-MB-Foto (Fix 2)
 *   SMOKE_KUNDE_PASS=… node scripts/smoke/zb1-upload-smoke.mjs --nur-walk
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE_URL || 'https://app.claimondo.de'
const CLAIM = 'fbc10002-0000-4000-8000-000000000002'   // scripts/test-fixtures/ids.ts CLAIMS.c2
const MAIL = process.env.SMOKE_KUNDE_EMAIL || 'smoke-kunde@claimondo.de'
const PASS = process.env.SMOKE_KUNDE_PASS || 'Claimondo2026!'
const GROSS = process.argv.includes('--gross')
const FOTO = GROSS ? 'tests/fixtures/test-foto.jpg' : 'tests/fixtures/test-logo.png'

// ── Ausgangszustand (NUR der; jeder Uebergang danach ist ein echter Klick) ──
if (!process.argv.includes('--nur-walk')) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('ENV fehlt — mit --env-file=.env.local starten'); process.exit(1) }
  const db = createClient(url, key, { auth: { persistSession: false } })

  const docs = await db.from('fall_dokumente').select('id')
    .eq('fall_id', CLAIM).eq('dokument_typ', 'fahrzeugschein')
  if ((docs.data?.length ?? 0) > 0) {
    const del = await db.from('fall_dokumente').delete()
      .eq('fall_id', CLAIM).eq('dokument_typ', 'fahrzeugschein').select('id')
    if (del.error) { console.error('DELETE fehlgeschlagen:', del.error.message); process.exit(1) }
    console.log(`Seed: ${del.data.length} Fahrzeugschein-Dokument(e) entfernt`)
  }
  const upd = await db.from('claims').update({ onboarding_complete: false }).eq('id', CLAIM).select('id')
  if (upd.error || upd.data.length !== 1) {
    console.error('Seed-UPDATE fehlgeschlagen:', upd.error?.message ?? `${upd.data?.length} Zeilen`); process.exit(1)
  }
  // Zurueckholen statt dem 200 vertrauen.
  const nach = await db.from('claims').select('onboarding_complete').eq('id', CLAIM).maybeSingle()
  if (nach.data?.onboarding_complete !== false) { console.error('Seed NICHT wirksam'); process.exit(1) }
  console.log('Seed: Onboarding offen, kein Fahrzeugschein  ✓')
}

// ── Der Weg durch die echte Oberflaeche ──
const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' })).newPage()
const kern = async () => (await page.locator('body').innerText()).split('Abmelden').pop()?.trim() ?? ''
const draftWeg = async () => {
  const b = page.getByRole('button', { name: /^Neu starten$/i })   // localStorage-Draft verwerfen
  if (await b.count() && await b.first().isVisible().catch(() => false)) {
    await b.first().click(); await page.waitForTimeout(2500)       // geprueft wird der DB-Zustand
  }
}

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', MAIL)
await page.fill('input[type="password"]', PASS)
await page.click('button[type="submit"]')
await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000)
if (page.url().includes('/login')) { console.error('LOGIN FEHLGESCHLAGEN'); await browser.close(); process.exit(1) }

await page.goto(`${BASE}/kunde/onboarding-details?fall_id=${CLAIM}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(5000); await draftWeg()
if (!/Fahrzeugschein/i.test(await kern())) {
  console.error('ABBRUCH: Phase nicht offen — der Lauf waere aussagelos (kennzeichen im Lead?)')
  await browser.close(); process.exit(1)
}
console.log(`① Fahrzeugschein wird gefragt  ✓   (Foto: ${FOTO})`)

await page.locator('input[type="file"]').first().setInputFiles(FOTO)
let preview = false
for (let i = 0; i < 30 && !preview; i++) {
  await page.waitForTimeout(5000)
  preview = /ausgelesen|prüfen Sie die ausgelesenen/i.test(await page.locator('body').innerText())
}
console.log(`② Upload durch, Preview da     ${preview ? '✓' : '(keine Preview-Signatur — pruefe trotzdem weiter)'}`)


for (const name of [/^Übernehmen$/i, /^Weiter$/i]) {
  const b = page.getByRole('button', { name })
  if (await b.count() && await b.first().isVisible().catch(() => false)) {
    await b.first().click(); await page.waitForTimeout(4000)
  }
}
console.log('③ Übernehmen + Weiter geklickt ✓')

await page.goto(`${BASE}/kunde/onboarding-details?fall_id=${CLAIM}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(6000); await draftWeg()
const fragtWieder = /Fahrzeugschein fotografieren|Vorderseite des Fahrzeugscheins/i.test(await kern())

console.log('='.repeat(62))
console.log(fragtWieder
  ? '❌ ROT — nach dem Reload wird ERNEUT nach dem Fahrzeugschein gefragt.'
  : '✅ GRUEN — nicht erneut gefragt. Soll erfuellt.')
console.log('='.repeat(62))
await browser.close()
process.exit(fragtWieder ? 1 : 0)
