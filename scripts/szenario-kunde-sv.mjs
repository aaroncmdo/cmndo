// Szenario-Smoke: Kunde links, SV rechts, beide live sichtbar.
//
// Ablauf:
//   1. Kunde: /gutachter-finden → Premium-Marker → Wizard 5 Phasen → Submit
//      → Anfrage finalisiert → Fall created
//   2. SV: Login → /gutachter/heute → neuer Termin sichtbar
//   3. SV: DB-Trigger losgefahren → angekommen → besichtigung gestartet
//   4. Verify: Subphase 2.1 (Vollmacht ausstehend) im Resolver
//
// Lauf: node scripts/szenario-kunde-sv.mjs

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.test' })

const envLocal = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }),
)
const admin = createClient(envLocal.NEXT_PUBLIC_SUPABASE_URL, envLocal.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const STAGING_USER = process.env.STAGING_BASIC_AUTH_USER
const STAGING_PASS = process.env.STAGING_BASIC_AUTH_PASS
const SV_EMAIL = process.env.SMOKE_TEST_SV_EMAIL ?? 'smoke-sv@claimondo.test'
const SV_PASS  = process.env.SMOKE_TEST_SV_PASSWORT ?? 'Test1234!'
const BASE     = 'https://app.staging.claimondo.de'

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = path.join('docs/13.05.2026/szenario-kunde-sv', ts)
mkdirSync(outDir, { recursive: true })

console.log('▶ Szenario-Smoke: Kunde links, SV rechts')
console.log('  Output:', outDir)

// ── Helpers ───────────────────────────────────────────────────────────────
function role(label) { return `[${label}]` }
async function shoot(page, label) {
  const p = path.join(outDir, `${label}.png`)
  await page.screenshot({ path: p, fullPage: true }).catch(() => {})
  return p
}

async function unterschreibe(page, testId) {
  // Sucht alle Canvas-Matches, nimmt nur sichtbares (Mobile + Desktop dupliziert)
  const allCanvases = page.locator(`canvas[data-testid="${testId}"]`)
  const count = await allCanvases.count()
  let canvas = null
  for (let i = 0; i < count; i++) {
    if (await allCanvases.nth(i).isVisible()) {
      canvas = allCanvases.nth(i)
      break
    }
  }
  if (!canvas) throw new Error(`Kein sichtbares canvas ${testId} gefunden (${count} insgesamt)`)
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas bounding-box null')
  const { x, y, width, height } = box
  // Längerer Zickzack damit der Signatur-Detector "non-empty" registriert
  await page.mouse.move(x + 20, y + height / 2)
  await page.mouse.down()
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(
      x + 20 + i * ((width - 40) / 10),
      y + height / 2 + (i % 2 === 0 ? -30 : 30),
      { steps: 8 },
    )
  }
  await page.mouse.up()
  await page.waitForTimeout(600)
}

// ── Browser-Setup: zwei SEPARATE Chromium-Instanzen (sonst Mapbox-OOM) ────
const browserKunde = await chromium.launch({
  headless: false,
  slowMo: 200,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-popup-blocking', '--window-position=0,0', '--window-size=800,1000'],
})
const browserSv = await chromium.launch({
  headless: false,
  slowMo: 200,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-popup-blocking', '--window-position=820,0', '--window-size=800,1000'],
})
const browser = { close: async () => { await browserKunde.close().catch(() => {}); await browserSv.close().catch(() => {}) } }

const ctxKunde = await browserKunde.newContext({
  viewport: { width: 780, height: 950 },
  locale: 'de-DE', timezoneId: 'Europe/Berlin',
  ...(STAGING_USER && STAGING_PASS ? { httpCredentials: { username: STAGING_USER, password: STAGING_PASS } } : {}),
})
const ctxSv = await browserSv.newContext({
  viewport: { width: 780, height: 950 },
  locale: 'de-DE', timezoneId: 'Europe/Berlin',
  ...(STAGING_USER && STAGING_PASS ? { httpCredentials: { username: STAGING_USER, password: STAGING_PASS } } : {}),
})
const kunde = await ctxKunde.newPage()
const sv = await ctxSv.newPage()
kunde.on('crash', () => console.log(role('Kunde'), '⚠ page crashed'))
sv.on('crash', () => console.log(role('SV'), '⚠ page crashed'))

const kundeEmail = `smoke-kunde-${Date.now()}@claimondo.test`

try {
  // ═══════════════════ KUNDE: Wizard ═══════════════════
  console.log(role('Kunde'), '→ 01 öffne /gutachter-finden')
  await kunde.goto(`${BASE}/gutachter-finden`, { waitUntil: 'domcontentloaded' })
  await kunde.bringToFront().catch(() => {})
  await kunde.waitForSelector('.mapboxgl-canvas', { timeout: 30000 })
  // Cookie-Consent: erst Click probieren, dann hart removen falls da
  const cookieBtn = kunde.locator('.CookieConsent button').first()
  if (await cookieBtn.count()) {
    await cookieBtn.click({ timeout: 3000, force: true }).catch(() => {})
    await kunde.waitForTimeout(500)
  }
  // Backup: DOM-removal falls Banner noch da
  await kunde.evaluate(() => {
    document.querySelectorAll('.CookieConsent').forEach(el => el.remove())
  }).catch(() => {})
  await kunde.waitForTimeout(4000)
  await kunde.waitForSelector('.mapboxgl-marker', { timeout: 12000 })
  await shoot(kunde, '01-kunde-karte')

  console.log(role('Kunde'), '→ 02 Premium-Marker klicken')
  // Premium-Marker hat goldenes ★-Badge; nimm den ersten der existiert
  const premiumMarker = kunde.locator('.mapboxgl-marker').first()
  await premiumMarker.click({ force: true, timeout: 6000 })
  await kunde.waitForSelector('.mapboxgl-popup-content button[data-testid="sv-anfrage-popup"]', { timeout: 10000 })
  await shoot(kunde, '02-kunde-popup')

  console.log(role('Kunde'), '→ 03 Anfrage-Button')
  await kunde.locator('.mapboxgl-popup-content button[data-testid="sv-anfrage-popup"]').first().click({ timeout: 6000 })
  // visible-Filter: Wizard ist 2x im DOM (Mobile + Desktop), nur einer sichtbar
  const v = (loc) => loc.locator('visible=true').first()
  await v(kunde.locator('input[name="besichtigungsort"]')).waitFor({ state: 'visible', timeout: 10000 })

  console.log(role('Kunde'), '→ 04 Phase 1: besichtigungsort')
  await v(kunde.locator('input[name="besichtigungsort"]')).fill('Musterstraße 12, 50667 Köln', { timeout: 5000 })
  await kunde.waitForTimeout(500)
  await v(kunde.locator('[data-testid="wizard-weiter"]')).click({ timeout: 6000 })

  console.log(role('Kunde'), '→ 05 Phase 2: termin (segmented + slot)')
  // wunschtermin_wann: explizit "tage" (In den nächsten Tagen — bietet die meisten Slots)
  await v(kunde.locator('[data-testid="feld-wunschtermin_wann-opt-tage"]')).waitFor({ state: 'visible', timeout: 12000 })
  await v(kunde.locator('[data-testid="feld-wunschtermin_wann-opt-tage"]')).click({ timeout: 5000 })
  await kunde.waitForTimeout(800)
  await v(kunde.locator('button[data-tag][data-frei="true"]')).waitFor({ state: 'visible', timeout: 8000 })
  await v(kunde.locator('button[data-tag][data-frei="true"]')).click({ timeout: 5000 })
  await kunde.waitForTimeout(500)
  await v(kunde.locator('button[data-slot]')).waitFor({ state: 'visible', timeout: 5000 })
  await v(kunde.locator('button[data-slot]')).click({ timeout: 5000 })
  await kunde.waitForTimeout(400)
  await shoot(kunde, '05-kunde-slot-gewaehlt')
  await v(kunde.locator('[data-testid="wizard-weiter"]')).click({ timeout: 6000 })

  console.log(role('Kunde'), '→ 06 Phase 3: service_typ KOMPLETT (mit Anwalt)')
  await v(kunde.locator('[data-testid="feld-service_typ-opt-komplett"]')).waitFor({ state: 'visible', timeout: 10000 })
  await v(kunde.locator('[data-testid="feld-service_typ-opt-komplett"]')).click({ timeout: 5000 })
  await kunde.waitForTimeout(400)
  await v(kunde.locator('[data-testid="wizard-weiter"]')).click({ timeout: 6000 })

  console.log(role('Kunde'), '→ 07 Phase 4: kanzlei_wunsch')
  await v(kunde.locator('[data-testid="feld-kanzlei_wunsch-opt-partnerkanzlei"]')).waitFor({ state: 'visible', timeout: 10000 })
  await v(kunde.locator('[data-testid="feld-kanzlei_wunsch-opt-partnerkanzlei"]')).click({ timeout: 5000 })
  await kunde.waitForTimeout(400)
  await v(kunde.locator('[data-testid="wizard-weiter"]')).click({ timeout: 6000 })

  console.log(role('Kunde'), '→ 08 Phase 5: kontakt + signature + DSGVO')
  await v(kunde.locator('input[name="vorname"]')).waitFor({ state: 'visible', timeout: 10000 })
  await v(kunde.locator('input[name="vorname"]')).fill('Smoke', { timeout: 5000 })
  await v(kunde.locator('input[name="nachname"]')).fill('Szenario', { timeout: 5000 })
  await v(kunde.locator('input[name="telefon"]')).fill('+4915112345678', { timeout: 5000 })
  await v(kunde.locator('input[name="email"]')).fill(kundeEmail, { timeout: 5000 })
  // bevorzugter_kanal: explizit email
  await v(kunde.locator('[data-testid="feld-bevorzugter_kanal-opt-email"]')).click({ timeout: 5000 })
  // Signature: zickzack auf sichtbarem Canvas
  await unterschreibe(kunde, 'feld-unterschrift')
  // DSGVO: CheckboxField ist ein <button data-testid="feld-dsgvo_zustimmung">,
  // KEIN <input type="checkbox">. Click toggled data-checked.
  await v(kunde.locator('[data-testid="feld-dsgvo_zustimmung"]')).click({ timeout: 5000 })
  await kunde.waitForTimeout(300)
  await shoot(kunde, '08-kunde-kontakt-gefuellt')
  console.log(role('Kunde'), '→ 09 Submit (finalize)')
  await v(kunde.locator('[data-testid="wizard-weiter"]')).click({ timeout: 6000 })
  // Warte bis "completed"-State im UI sichtbar
  await kunde.waitForTimeout(5000)
  await shoot(kunde, '09-kunde-submitted')

  // ── DB-Verify: Anfrage finalisiert? ─────────────────────────────────────
  console.log(role('DB'), '→ 10 Anfrage + Fall in DB suchen')
  let { data: anfrageRow } = await admin
    .from('gutachter_finder_anfragen')
    .select('id, status, kunde_email, regulierungs_modus, reservierter_slot_von, reservierter_sv_id, zugeordneter_sv_lead_id')
    .eq('kunde_email', kundeEmail)
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()
  console.log(role('DB'), '  Anfrage:', anfrageRow)

  let fall = null
  for (let i = 0; i < 20; i++) {
    const { data } = await admin
      .from('faelle')
      .select('id, fall_nummer, status, service_typ, sa_unterschrieben_am, vollmacht_status, vollmacht_signiert_am, sv_id, kunde_email')
      .eq('kunde_email', kundeEmail)
      .maybeSingle()
    if (data) { fall = data; break }
    await new Promise(r => setTimeout(r, 500))
  }
  if (!fall) throw new Error('Fall wurde nach 10s nicht angelegt — finalize-Pfad gebrochen?')
  console.log(role('DB'), '  Fall:', fall)

  // Termin der GFA herausfinden — beste Quelle: gutachter_termine via fall_id ODER über reservierter_sv_id + Zeit
  let termin = null
  for (let i = 0; i < 10; i++) {
    const { data } = await admin
      .from('gutachter_termine')
      .select('id, fall_id, sv_id, start_zeit, end_zeit, status, sv_unterwegs_seit, sv_angekommen_am')
      .eq('fall_id', fall.id)
      .order('erstellt_am', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) { termin = data; break }
    await new Promise(r => setTimeout(r, 500))
  }
  console.log(role('DB'), '  Termin:', termin)

  // Kunde-Browser: navigiere zur Fall-Übersicht damit Live-Banner sichtbar wird
  console.log(role('Kunde'), '→ 11 Kunde navigiert zur Fallakte (live mitschauen)')
  await kunde.goto(`${BASE}/kunde/faelle/${fall.id}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await kunde.waitForTimeout(2000)
  await shoot(kunde, '11-kunde-fallakte')

  // ═══════════════════ SV-SEITE ═══════════════════
  // SV-Geolocation: Köln, knapp vor Besichtigungsort (Mapbox-Geocoded am Anfang)
  await ctxSv.grantPermissions(['geolocation'])
  // Start: ~5km nördlich vom Schadenort (Köln Mülheim → Innenstadt)
  await ctxSv.setGeolocation({ latitude: 50.96, longitude: 6.96 })

  console.log(role('SV'), '→ 12 Login')
  await sv.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await sv.bringToFront().catch(() => {})
  await sv.locator('[name="email"]').fill(SV_EMAIL, { timeout: 5000 })
  await sv.locator('[name="passwort"]').fill(SV_PASS, { timeout: 5000 })
  await sv.locator('[type="submit"]').first().click({ timeout: 8000 })
  await sv.waitForURL(/\/gutachter|\/heute|\/auftraege/, { timeout: 12000 }).catch(() => {})
  await shoot(sv, '12-sv-eingeloggt')

  // SV → Tagesmodus / Feldmodus (statt Fallakte)
  console.log(role('SV'), '→ 13 SV öffnet Tagesmodus')
  await sv.goto(`${BASE}/gutachter/feldmodus`, { waitUntil: 'domcontentloaded' })
  await sv.waitForTimeout(3000)
  await shoot(sv, '13-sv-feldmodus')

  // ── Drive-State-Transitionen: losgefahren → angekommen → besichtigung ──
  // FeldmodusClient triggert startStop() automatisch via useEffect wenn ein
  // aktiver Stop existiert. Falls die UI noch nicht react'iert, machen wir
  // den DB-Schub und sehen den Effekt beim nächsten Realtime-Update.

  console.log(role('DB→SV'), '→ 14 setze sv_unterwegs_seit (losgefahren)')
  if (termin) {
    const nowIso = new Date().toISOString()
    await admin.from('gutachter_termine').update({ sv_unterwegs_seit: nowIso, status: 'unterwegs' }).eq('id', termin.id)
    console.log(role('DB'), '  ✅ termin.sv_unterwegs_seit gesetzt')
  }
  // Kunde refresht — sollte jetzt KundeSvLiveBanner sehen
  await kunde.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await kunde.waitForTimeout(2500)
  await shoot(kunde, '14-kunde-sieht-unterwegs')
  await shoot(sv, '14-sv-unterwegs')

  // SV fährt — GPS-Position rückt schrittweise an Besichtigungsort
  console.log(role('SV'), '→ 15 GPS rückt an Besichtigungsort')
  const route = [
    [50.955, 6.958],
    [50.948, 6.954],
    [50.940, 6.950],
    [50.935, 6.948],
    [50.930, 6.946],
  ]
  for (const [lat, lng] of route) {
    await ctxSv.setGeolocation({ latitude: lat, longitude: lng })
    await sv.waitForTimeout(1500)
  }
  await shoot(sv, '15-sv-fahre-an')

  console.log(role('DB→SV'), '→ 16 setze sv_angekommen_am (geofence-trigger)')
  if (termin) {
    const nowIso = new Date().toISOString()
    await admin.from('gutachter_termine').update({ sv_angekommen_am: nowIso }).eq('id', termin.id)
    console.log(role('DB'), '  ✅ termin.sv_angekommen_am gesetzt')
  }
  await kunde.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await kunde.waitForTimeout(2500)
  await shoot(kunde, '16-kunde-sieht-angekommen')
  await sv.reload({ waitUntil: 'domcontentloaded' })
  await sv.waitForTimeout(2000)
  await shoot(sv, '16-sv-angekommen')

  console.log(role('DB→SV'), '→ 17 setze besichtigung_gestartet_am')
  if (termin) {
    const nowIso = new Date().toISOString()
    await admin.from('gutachter_termine').update({ besichtigung_gestartet_am: nowIso }).eq('id', termin.id)
    await admin.from('faelle').update({ besichtigung_gestartet_am: nowIso }).eq('id', fall.id)
    console.log(role('DB'), '  ✅ besichtigung_gestartet_am gesetzt')
  }
  await kunde.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await kunde.waitForTimeout(2500)
  await shoot(kunde, '17-kunde-sieht-besichtigung-laeuft')
  await sv.reload({ waitUntil: 'domcontentloaded' })
  await sv.waitForTimeout(2000)
  await shoot(sv, '17-sv-besichtigung-laeuft')

  // ── Final-Verify ──────────────────────────────────────────────────────
  console.log(role('Verify'), '→ 16 SA-Unterschrift simulieren (sa_unterschrieben_am)')
  await admin.from('faelle').update({ sa_unterschrieben_am: new Date().toISOString() }).eq('id', fall.id)

  const { data: fallFinal } = await admin
    .from('faelle')
    .select('id, service_typ, sa_unterschrieben_am, vollmacht_status, vollmacht_signiert_am')
    .eq('id', fall.id)
    .maybeSingle()
  console.log(role('DB'), '  Fall-Final:', fallFinal)

  // Subphase-Resolver (zur Bestätigung — siehe scripts/test-vollmacht-trigger.mjs)
  const tsx = await import('tsx/esm/api').catch(() => null)
  if (tsx) tsx.register()
  const { resolveSubphase } = await import('../src/lib/fall/subphase-resolver.ts')
  const sub = resolveSubphase({ fall: fallFinal, lead: null, gutachter_termine: [termin].filter(Boolean), webhook_events: [] })
  console.log(role('Verify'), `  → Subphase: ${sub.subphase} (${sub.label})`)
  if (sub.subphase === '2.1') {
    console.log(role('Verify'), '  ✅ Vollmacht-Trigger korrekt aktiv — vollmacht-reminder-Cron würde Task feuern')
  } else {
    console.log(role('Verify'), `  ❌ Erwartet 2.1, bekam ${sub.subphase}`)
  }

  console.log()
  console.log('✅ Szenario fertig — Browser bleiben 60s offen.')
  await sv.waitForTimeout(60000)
} catch (err) {
  console.log()
  console.log('❌ Fehler:', err.message)
  console.log('Stack:', err.stack)
  await shoot(kunde, 'FAIL-kunde').catch(() => {})
  await shoot(sv, 'FAIL-sv').catch(() => {})
  console.log('Browser bleiben 90s offen für Inspect.')
  await sv.waitForTimeout(90000)
} finally {
  await browser.close()
  console.log(`Output: ${outDir}`)
}
