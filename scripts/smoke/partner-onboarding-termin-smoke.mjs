// Partner-Onboarding-Termine (3) — Prod-DB-Smoke (service-role, self-contained).
// Spiegelt die DB-Operationen der Server-Action legePartnerOnboardingTermin gegen
// die PROD-DB (die DDL 20260708144527 ist live). Testet mit ECHTEN Testdaten:
//   * echter Google-Geocode (vor_ort-Adresse)
//   * admin_termine-Insert gegen die LIVE typ/kanal-CHECKs + partner_lead_id-FK
//     (vor_ort + online) mit EXAKT der Action-Payload
//   * Negativ-Tests: kanal='bogus' + typ='bogus' MUESSEN abgelehnt werden (Guard live?)
//   * Loader-Query (exakt wie page.tsx) -> Drawer-Sicht
//   * Auto-Log partner_lead_aktivitaeten typ='sonstiges'
//   * minimaler ICS-Aufbau aus den Termin-Daten
// Kein Mailversand, keine echte Person: seed-Lead hat email=NULL. Raeumt alles auf.
//
// Nutzung (node >= 18):
//   node scripts/smoke/partner-onboarding-termin-smoke.mjs           # clean + seed + smoke + clean
//   node scripts/smoke/partner-onboarding-termin-smoke.mjs --clean   # nur aufraeumen

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// --- env aus .env.local (Worktree ODER primaerer Checkout als Fallback) ---
const ENV_CANDIDATES = [
  fileURLToPath(new URL('../../.env.local', import.meta.url)),
  'C:\\Users\\Aaron Sprafke\\stampit-app\\stampit-app\\claimondo-v2\\.env.local',
]
let envRaw = null
for (const p of ENV_CANDIDATES) {
  try { envRaw = readFileSync(p, 'utf8'); break } catch { /* next */ }
}
if (!envRaw) throw new Error('.env.local nicht gefunden: ' + ENV_CANDIDATES.join(' | '))
const env = {}
for (const line of envRaw.split('\n')) {
  const l = line.replace(/\r$/, '')
  if (!l.includes('=') || l.trimStart().startsWith('#')) continue
  const i = l.indexOf('=')
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const GKEY = env.GOOGLE_MAPS_SERVER_KEY || env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
if (!URL_ || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// --- Konstanten ---
const CLEAN = process.argv.includes('--clean')
const STAFF = '22b65fa0-4bcf-4c4c-8ab9-f119670c7db0' // admin@claimondo.de
const FIRMA_MARKER = 'SMOKE-ONB Werkstatt'           // firma beginnt damit -> cleanup
const TITEL_MARKER = 'Onboarding: SMOKE-ONB'         // titel beginnt damit -> cleanup (ON DELETE SET NULL Orphans)
const ADRESSE = 'Domkloster 4, 50667 Köln'

let fails = 0
const pass = (n, d = '') => console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)
const fail = (n, d = '') => { fails++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`) }
const warn = (n, d = '') => console.log(`  ⚠ ${n}${d ? ' — ' + d : ''}`)
const check = (n, cond, d = '') => (cond ? pass(n, d) : fail(n, d))

async function clean() {
  // 1) Smoke-Leads finden
  const { data: leads } = await db.from('partner_leads').select('id').ilike('firma', FIRMA_MARKER + '%')
  const leadIds = (leads ?? []).map((l) => l.id)
  // 2) Termine per Titel-Marker (faengt auch ON-DELETE-SET-NULL-Orphans frueherer Laeufe) + per partner_lead_id
  await db.from('admin_termine').delete().ilike('titel', TITEL_MARKER + '%')
  if (leadIds.length) {
    await db.from('admin_termine').delete().in('partner_lead_id', leadIds)
    await db.from('partner_lead_aktivitaeten').delete().in('partner_lead_id', leadIds)
    await db.from('partner_leads').delete().in('id', leadIds)
  }
  console.log(`  cleaned: ${leadIds.length} lead(s) + termine(titel/lead) + aktivitaeten`)
  return leadIds.length
}

async function geocode(addr) {
  if (!GKEY) return { ok: false, reason: 'kein GOOGLE_MAPS_SERVER_KEY im env' }
  const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&region=de&key=${GKEY}`
  const r = await fetch(u)
  const j = await r.json()
  if (j.status !== 'OK' || !j.results?.[0]) return { ok: false, reason: 'Geocode-Status ' + j.status }
  const g = j.results[0]
  return { ok: true, lat: g.geometry.location.lat, lng: g.geometry.location.lng, formatted: g.formatted_address }
}

function tomorrowAt(h) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(h, 0, 0, 0)
  return d
}

function buildMinimalIcs({ uid, summary, startsAt, endsAt, location }) {
  const z = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${uid}@claimondo.de`, `DTSTART:${z(startsAt)}`, `DTEND:${z(endsAt)}`,
    `SUMMARY:${summary}`, location ? `LOCATION:${location}` : '', 'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
}

async function main() {
  console.log(`\n== Partner-Onboarding-Termine Smoke (${CLEAN ? 'CLEAN' : 'SEED+SMOKE'}) gegen ${URL_} ==`)
  await clean()
  if (CLEAN) { console.log('  --clean fertig.\n'); return }

  const ts = new Date().toISOString().slice(0, 16)
  const firma = `${FIRMA_MARKER} ${ts}`

  // --- Seed Prospect (email=NULL -> nie eine echte Person) ---
  const { data: lead, error: lErr } = await db.from('partner_leads').insert({
    rolle: 'werkstatt', status: 'neu', source_channel: 'admin', firma, email: null,
    ansprechpartner_vorname: 'Max', ansprechpartner_nachname: 'Smoke',
    plz: '50667', ort: 'Köln', strasse: 'Domkloster 4', zugewiesen_an: STAFF,
  }).select('id').single()
  if (lErr) { fail('seed partner_lead', lErr.message); process.exit(1) }
  const leadId = lead.id
  pass('seed partner_lead', `${firma} -> ${leadId}`)

  // --- 1) Echter Google-Geocode (vor_ort) — BEST-EFFORT (Action faengt Fehler ab) ---
  const geo = await geocode(ADRESSE)
  if (geo.ok) pass('geocode (echter Google-Call)', `${geo.lat.toFixed(4)},${geo.lng.toFixed(4)} — ${geo.formatted}`)
  else warn('geocode best-effort uebersprungen', `${geo.reason} (lokal kein GOOGLE_MAPS_SERVER_KEY; in der Action non-fatal -> Termin ohne Koordinaten)`)
  // Action-Semantik: nur bei geo.ok werden Koordinaten gesetzt, sonst bleiben sie NULL.
  const gLat = geo.ok ? geo.lat : null
  const gLng = geo.ok ? geo.lng : null
  const gFmt = geo.ok ? geo.formatted : ADRESSE

  const start = tomorrowAt(10)
  const end = new Date(start.getTime() + 30 * 60000)

  // --- 2) NEGATIV: kanal='bogus' MUSS abgelehnt werden (kanal-Check live?) ---
  {
    const { error } = await db.from('admin_termine').insert({
      typ: 'partner_onboarding', titel: TITEL_MARKER + ' NEG-kanal', start_zeit: start.toISOString(),
      end_zeit: end.toISOString(), status: 'offen', kanal: 'bogus', partner_lead_id: leadId,
      zugewiesen_an: STAFF, erstellt_von: STAFF,
    })
    check('kanal-CHECK lehnt "bogus" ab', !!error, error ? '(erwartet: Insert abgelehnt)' : 'FEHLER: durchgelassen!')
  }
  // --- 3) NEGATIV: typ='bogus' MUSS abgelehnt werden (typ-Check live?) ---
  {
    const { error } = await db.from('admin_termine').insert({
      typ: 'bogus_typ', titel: TITEL_MARKER + ' NEG-typ', start_zeit: start.toISOString(),
      end_zeit: end.toISOString(), status: 'offen', kanal: 'vor_ort', partner_lead_id: leadId,
      zugewiesen_an: STAFF, erstellt_von: STAFF,
    })
    check('typ-CHECK lehnt "bogus_typ" ab', !!error, error ? '(erwartet: Insert abgelehnt)' : 'FEHLER: durchgelassen!')
  }

  // --- 4) vor_ort-Termin (exakte Action-Payload) ---
  const { data: t1, error: e1 } = await db.from('admin_termine').insert({
    typ: 'partner_onboarding', titel: `Onboarding: ${firma}`,
    beschreibung: `Onboarding vor Ort: ${gFmt}`, start_zeit: start.toISOString(), end_zeit: end.toISOString(),
    status: 'offen', kanal: 'vor_ort', partner_lead_id: leadId, treffpunkt_adresse: gFmt,
    treffpunkt_lat: gLat, treffpunkt_lng: gLng, zugewiesen_an: STAFF, erstellt_von: STAFF, erinnerung_min_vorher: 60,
  }).select('id, kanal, treffpunkt_lat, treffpunkt_adresse').single()
  check('vor_ort-Insert best-effort (typ/kanal/FK akzeptiert, Koord optional)', !e1 && !!t1,
    e1 ? e1.message : `id ${t1.id}, treffpunkt_lat=${t1?.treffpunkt_lat ?? 'NULL (best-effort ok)'}`)

  // --- 5) online-Termin: simuliert createMeetEvent-Erfolg (echter Meet-Link braucht Staff-OAuth) ---
  const start2 = tomorrowAt(14)
  const end2 = new Date(start2.getTime() + 30 * 60000)
  const { data: t2, error: e2 } = await db.from('admin_termine').insert({
    typ: 'partner_onboarding', titel: `Onboarding: ${firma}`,
    beschreibung: 'Video-Onboarding via Google Meet: https://meet.google.com/smoke-xyz',
    start_zeit: start2.toISOString(), end_zeit: end2.toISOString(), status: 'offen', kanal: 'online',
    partner_lead_id: leadId, video_link: 'https://meet.google.com/smoke-xyz',
    google_event_id: 'smoke-evt-123', google_calendar_id: 'primary',
    google_event_synced_at: new Date().toISOString(), zugewiesen_an: STAFF, erstellt_von: STAFF, erinnerung_min_vorher: 60,
  }).select('id, kanal, video_link').single()
  check('online-Insert (video_link/google_event_id persistiert)', !e2 && !!t2, e2 ? e2.message : `id ${t2.id}, meet ${t2?.video_link}`)

  // --- 6) Loader-Query EXAKT wie page.tsx ---
  const { data: loaded, error: lqErr } = await db.from('admin_termine')
    .select('id, partner_lead_id, start_zeit, end_zeit, kanal, video_link, treffpunkt_adresse, status, titel')
    .eq('typ', 'partner_onboarding').in('partner_lead_id', [leadId]).order('start_zeit', { ascending: true })
  const both = (loaded ?? []).length >= 2
  const hasVor = (loaded ?? []).some((t) => t.kanal === 'vor_ort' && t.treffpunkt_adresse)
  const hasOnline = (loaded ?? []).some((t) => t.kanal === 'online' && t.video_link)
  check('Loader-Query liefert beide Termine (Drawer-Sicht)', both && hasVor && hasOnline && !lqErr,
    lqErr ? lqErr.message : `${(loaded ?? []).length} Zeilen, vor_ort+online sichtbar`)

  // --- 7) Auto-Log (typ='sonstiges' vom aktivitaeten-CHECK erlaubt?) ---
  const { data: akt, error: aErr } = await db.from('partner_lead_aktivitaeten').insert({
    partner_lead_id: leadId, typ: 'sonstiges',
    text: `Onboarding-Termin angelegt: ${start.toLocaleString('de-DE')} (vor Ort).`, erstellt_von: STAFF,
  }).select('id').single()
  check('Auto-Log partner_lead_aktivitaeten typ=sonstiges', !aErr && !!akt, aErr ? aErr.message : `id ${akt.id}`)

  // --- 8) ICS aus den Termin-Daten ---
  const ics = buildMinimalIcs({ uid: `partner-onboarding-${t1?.id ?? 'x'}`, summary: `Onboarding: ${firma}`, startsAt: start, endsAt: end, location: gFmt })
  check('ICS enthaelt VEVENT/DTSTART/SUMMARY/LOCATION',
    ics.includes('BEGIN:VEVENT') && ics.includes('DTSTART:') && ics.includes('SUMMARY:Onboarding') && ics.includes('LOCATION:'))

  // --- Cleanup + Verify-Gone ---
  const removed = await clean()
  const { data: rest } = await db.from('admin_termine').select('id').ilike('titel', TITEL_MARKER + '%')
  const { data: restLeads } = await db.from('partner_leads').select('id').ilike('firma', FIRMA_MARKER + '%')
  check('Cleanup vollstaendig (0 Rest-Termine + 0 Rest-Leads)', (rest ?? []).length === 0 && (restLeads ?? []).length === 0,
    `Rest-Termine ${(rest ?? []).length}, Rest-Leads ${(restLeads ?? []).length}`)

  console.log(`\n== ${fails === 0 ? 'SMOKE PASS ✓ (alle Checks gruen)' : 'SMOKE FAIL ✗ (' + fails + ' Fehler)'} ==\n`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((e) => { console.error('SMOKE-FEHLER:', e.message); process.exit(1) })
