// Fundament J10 (Dispatch/Werkstatt-Finder) — Service-Role Seed / Assert / Clean.
//
// Beweist (via werkstatt-finder-smoke.spec.ts):
//   S1 — Kunde-Fallakte (fiktive Abrechnung): der Werkstatt-Finder erscheint (#3922-Fiktiv-Gate) und
//        die Auswahl der Smoke-Werkstatt schreibt reparatur_werkstatt_id (waehleWerkstattPortal ->
//        assignReparaturWerkstatt).
//   S3 — Werkstatt-Portal: ein bereits zugewiesener Auftrag erscheint unter /werkstatt/auftraege.
//   (S2 Flow-Wizard = fragile 14-Schritt-Heuristik -> in der Spec test.skip.)
//
// Finder-Gate (belegt): WerkstattFinderCard rendert nur bei `brauchtVermittlung && reparaturPhaseErreicht`
//   (GeldZone.tsx:50). brauchtVermittlung = reparaturwunsch ∈ {reparatur,fiktiv} + beide Werkstatt-IDs
//   NULL + vermittlung_status='offen' (vermittlung-core.ts:26-33). reparaturPhaseErreicht = sofort true
//   bei abrechnungsweg ∈ {selbstzahler,kasko} (reparatur-phase-erreicht.ts:14-23). Der alte Seed setzte
//   KEIN abrechnungsweg -> reparaturPhaseErreicht=false -> Karte rendert nie. Deshalb: fiktiv + selbstzahler.
// nurEchte-Filter: findQualifizierteReparaturWerkstaetten({nurEchte:true}) filtert per istInterneEmail
//   (werkstaetten.email) — die Wegwerf-Werkstatt braucht email=NULL, sonst ist sie im Finder unsichtbar.
//   Comms laufen ueber die @claimondo.test-Profil-Email + telefon=NULL -> Send-Layer suppressed alles.
//
// ISOLATION (Regel 4): Wegwerf-Konten @claimondo.test (telefon=NULL), eigene Wegwerf-Werkstatt (KEINE
//   feste prod-Fixture -> die frueher genutzte badecb82 existiert nicht mehr = genau der Drift), Marker
//   in schadenort_adresse -> --clean findet alles wieder.
//
// Nutzung (aus Repo-Root, node >= 18; env: process.env-first, .env.local nur lokal):
//   node scripts/smoke/werkstatt-finder-seed.mjs           # raeumt alte Reste + seedet frisch
//   node scripts/smoke/werkstatt-finder-seed.mjs --assert  # prueft den Seed-Zustand (DB)
//   node scripts/smoke/werkstatt-finder-seed.mjs --clean   # nur aufraeumen

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// --- env: process.env-first (CI hat kein .env.local), sonst .env.local (Prod-Mirror) ---
const ENV_CANDIDATES = [
  new URL('../../.env.local', import.meta.url),
  'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local',
  '/var/www/claimondo-v2/.env.local',
]
const env = {}
for (const c of ENV_CANDIDATES) {
  try {
    const raw = readFileSync(c, 'utf8')
    for (const line of raw.split('\n')) {
      const l = line.replace(/\r$/, '')
      if (!l.includes('=') || l.trimStart().startsWith('#')) continue
      const i = l.indexOf('=')
      env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
    break
  } catch { /* naechster Kandidat */ }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (weder .env.local noch process.env)')
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// --- Konstanten ---
const KOELN = { lat: 50.9413, lng: 6.9583, plz: '50667', ort: 'Köln' }
const MARKER = 'SMOKE-WF Koeln (Test)'
const OUT = new URL('./.werkstatt-finder-seed.json', import.meta.url)
const MODE = process.argv.includes('--clean') ? 'clean' : process.argv.includes('--assert') ? 'assert' : 'seed'
const log = (...a) => console.log(...a)

async function createUser(email, password) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (!error) return data.user.id
  if (!/already|registered|exists/i.test(error.message)) throw error
  for (let page = 1; page <= 20; page++) {
    const { data: list } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    const u = list?.users?.find((x) => x.email?.toLowerCase() === email.toLowerCase())
    if (u) { await db.auth.admin.updateUserById(u.id, { password, email_confirm: true }); return u.id }
    if (!list || list.users.length < 1000) break
  }
  throw new Error(`User ${email} existiert, via listUsers nicht gefunden`)
}

async function upsertProfile(id, email, rolle, vorname, nachname) {
  const { error } = await db.from('profiles').upsert(
    { id, email, rolle, vorname, nachname, telefon: null, force_password_change: false },
    { onConflict: 'id' },
  )
  if (error) log('  ! profiles-upsert warn:', error.message)
}

async function loadSummary() {
  if (!existsSync(OUT)) throw new Error('.werkstatt-finder-seed.json fehlt — erst seeden.')
  return JSON.parse(readFileSync(OUT, 'utf8'))
}

// ---------------------------------------------------------------- CLEAN
async function clean(summary) {
  const s = summary ?? (existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null)
  const { data: claims } = await db.from('claims').select('id').eq('schadenort_adresse', MARKER)
  const claimIds = [...new Set([...(claims ?? []).map((c) => c.id), ...(s ? [s.claimId, s.s3ClaimId] : [])].filter(Boolean))]
  for (const cid of claimIds) {
    const { data: files } = await db.storage.from('fall-dokumente').list(cid)
    if (files?.length) await db.storage.from('fall-dokumente').remove(files.map((f) => `${cid}/${f.name}`))
    await db.from('fall_dokumente').delete().eq('claim_id', cid)
    await db.from('reparatur_termine').delete().eq('claim_id', cid)
    await db.from('partner_provisionen').delete().eq('claim_id', cid)
    await db.from('timeline').delete().eq('fall_id', cid)
    await db.from('phase_transitions').delete().eq('fall_id', cid)
    await db.from('claims').delete().eq('id', cid) // CASCADE -> faelle_claim_bridge
  }
  // Leads mit Marker (falls von frueheren Seed-Versionen; aktuell legt der Seed keine an).
  const { data: leads } = await db.from('leads').select('id').eq('besichtigungsort_adresse', MARKER)
  const leadIds = (leads ?? []).map((l) => l.id)
  if (leadIds.length) {
    await db.from('flow_links').delete().in('lead_id', leadIds)
    await db.from('leads').delete().in('id', leadIds)
  }
  // MUSTER-basiert statt summary-basiert (CI-Leichen-Fix 08.08.): auf frischen CI-Runnern
  // existiert das Summary-JSON des Vorlaufs NIE -> der fruehere `if (s)`-Block raeumte in CI
  // nichts, und die konto-lose S1-Smoke-Werkstatt (email=NULL, kein user_id) wurde NIRGENDS
  // geraeumt -> +1 Werkstatt-Leiche pro Lauf. Ab 5 Leichen war die Top-5-Finder-Liste am
  // Koeln-Standort voll und S1 fand die frische Werkstatt nicht mehr (J10 rot ab 05.08. 15:41,
  // 5 Laeufe in Folge). Jetzt: alle Alt-Artefakte per Namens-/Email-Muster raeumen.
  let leichen = 0
  const { data: altWs } = await db.from('werkstaetten').select('id, name').like('name', 'SMOKE WF-Werkstatt %')
  for (const w of altWs ?? []) {
    // Marker-Claims sind oben schon weg; haengt eine Leiche noch an einem FREMDEN Claim
    // (reparatur_werkstatt_id/werkstatt_id-FK), soll der Delete sichtbar scheitern statt crashen.
    const { error } = await db.from('werkstaetten').delete().eq('id', w.id)
    if (error) log(`  ! werkstatt-Leiche ${w.name} nicht loeschbar: ${error.message}`)
    else leichen++
  }
  const { data: altProfs } = await db
    .from('profiles')
    .select('id')
    .or('email.ilike.throwaway-werkstatt-wf-%,email.ilike.throwaway-kunde-wf-%')
  const zweiStd = new Date(Date.now() - 2 * 3600e3).toISOString()
  for (const p of altProfs ?? []) {
    await db.from('mitteilungen').delete().eq('empfaenger_id', p.id).gt('created_at', zweiStd)
    await db.from('werkstaetten').delete().eq('user_id', p.id)
    await db.from('profiles').delete().eq('id', p.id)
    await db.auth.admin.deleteUser(p.id).catch(() => {})
  }
  log(`  cleaned: ${claimIds.length} claim(s) + ${leadIds.length} lead(s) + ${leichen} Werkstatt-Leiche(n) + ${(altProfs ?? []).length} Konto/en (Marker "${MARKER}")`)
}

// ---------------------------------------------------------------- SEED
async function ensureBridge(claimId) {
  let { data: bridge } = await db.from('faelle_claim_bridge').select('fall_id').eq('claim_id', claimId).maybeSingle()
  if (!bridge) {
    const { error } = await db.from('faelle_claim_bridge').insert({ claim_id: claimId, fall_id: claimId })
    if (error) throw new Error('bridge insert: ' + error.message)
    bridge = { fall_id: claimId }
  }
  return bridge.fall_id
}

async function seed() {
  const stamp = Date.now().toString(36) + '-' + randomUUID().slice(0, 8)
  const wsEmail = `throwaway-werkstatt-wf-${stamp}@claimondo.test`
  const wsPw = `Thrw-${stamp}-Ws9!`
  const kEmail = `throwaway-kunde-wf-${stamp}@claimondo.test`
  const kPw = `Thrw-${stamp}-Ku9!`

  // 1) Wegwerf-Konten: Kunde (S1-Fallakte-Login) + Werkstatt (S3-Portal-Login).
  const kundeUid = await createUser(kEmail, kPw)
  await upsertProfile(kundeUid, kEmail, 'kunde', 'Smoke', 'WfKunde')
  const werkstattUid = await createUser(wsEmail, wsPw)
  await upsertProfile(werkstattUid, wsEmail, 'werkstatt', 'Smoke', 'WfWerkstatt')

  // Eigene Wegwerf-Werkstatt. email=NULL -> im nurEchte:true-Finder sichtbar (finder.ts:46-48).
  // Koordinaten = Schadenort -> Distanz 0 = Platz 1 im Ranking. status='aktiv' (Portal-Gate + Anti-IDOR).
  const wsName = `SMOKE WF-Werkstatt ${stamp}`
  const { data: ws, error: wErr } = await db
    .from('werkstaetten')
    .insert({
      user_id: werkstattUid,
      name: wsName,
      status: 'aktiv',
      verifiziert: true,
      ist_freie_werkstatt: true,
      lat: KOELN.lat,
      lng: KOELN.lng,
      adresse_plz: KOELN.plz,
      adresse_ort: KOELN.ort,
      email: null, // <- Pflicht fuer nurEchte-Sichtbarkeit
      telefon: null,
    })
    .select('id')
    .single()
  if (wErr) throw new Error('werkstaetten insert: ' + wErr.message)
  const werkstattId = ws.id

  // 2) S1-Claim: fiktiv + selbstzahler + beide Werkstatt-IDs NULL + offen -> Finder erscheint, unzugewiesen.
  const today = new Date().toISOString().slice(0, 10)
  const { data: s1, error: c1Err } = await db
    .from('claims')
    .insert({
      geschaedigter_user_id: kundeUid,
      schadentag: today,
      abrechnungsweg: 'selbstzahler', // -> reparaturPhaseErreicht sofort true
      reparaturwunsch: 'fiktiv', // -> brauchtVermittlung (Fiktiv-Gate #3922)
      reparatur_vermittlung_status: 'offen',
      schadenort_adresse: MARKER,
      schadenort_ort: KOELN.ort,
      schadenort_plz: KOELN.plz,
      schadenort_lat: KOELN.lat,
      schadenort_lng: KOELN.lng,
    })
    .select('id')
    .single()
  if (c1Err) throw new Error('S1-claim insert: ' + c1Err.message)
  const s1ClaimId = s1.id
  await db.from('claims').update({ onboarding_complete: true }).eq('id', s1ClaimId)
  await ensureBridge(s1ClaimId)

  // 3) S3-Claim: bereits der Wegwerf-Werkstatt zugewiesen (vermittelt + reparatur-laeuft) -> erscheint
  //    im Werkstatt-Portal (v_werkstatt_auftrag), unabhaengig vom S1-Klick.
  const { data: s3, error: c3Err } = await db
    .from('claims')
    .insert({
      geschaedigter_user_id: kundeUid,
      schadentag: today,
      abrechnungsweg: 'selbstzahler',
      reparaturwunsch: 'reparatur',
      schadenort_adresse: MARKER,
      schadenort_ort: KOELN.ort,
      schadenort_plz: KOELN.plz,
      schadenort_lat: KOELN.lat,
      schadenort_lng: KOELN.lng,
    })
    .select('id')
    .single()
  if (c3Err) throw new Error('S3-claim insert: ' + c3Err.message)
  const s3ClaimId = s3.id
  const { error: u3Err } = await db
    .from('claims')
    .update({
      operative_status: 'reparatur-laeuft',
      reparatur_werkstatt_id: werkstattId,
      reparatur_vermittlung_status: 'vermittelt',
      onboarding_complete: true,
    })
    .eq('id', s3ClaimId)
  if (u3Err) throw new Error('S3-claim update: ' + u3Err.message)
  await ensureBridge(s3ClaimId)
  const morgen = new Date(Date.now() + 864e5).toISOString()
  const { error: tErr } = await db.from('reparatur_termine').insert({
    claim_id: s3ClaimId,
    werkstatt_id: werkstattId,
    status: 'bestaetigt',
    bestaetigter_termin: morgen,
    wunschtermin: morgen,
    erstellt_von: kundeUid,
  })
  if (tErr) log('  ! reparatur_termine (S3) warn:', tErr.message)

  const summary = {
    stamp, kundeUid, werkstattUid, werkstattId,
    kundeEmail: kEmail, kundePw: kPw,
    werkstattEmail: wsEmail, werkstattPw: wsPw,
    smokeWerkstattId: werkstattId, smokeWerkstattName: wsName,
    claimId: s1ClaimId, s3ClaimId,
    fallakteUrl: `/kunde/faelle/${s1ClaimId}`,
    seededAt: new Date().toISOString(),
  }
  writeFileSync(OUT, JSON.stringify(summary, null, 2))
  log('\n  --- SEED FERTIG ---')
  log('  S1 Kunde-Fallakte (Finder):', summary.fallakteUrl, '(Login', kEmail + ')')
  log('  S3 Werkstatt-Portal:', wsEmail, '/', wsPw, '-> /werkstatt/auftraege (Claim', s3ClaimId + ')')
  log('  Smoke-Werkstatt:', werkstattId, `"${wsName}" (email=NULL, nurEchte-sichtbar)`)
  log('  Summary ->', OUT.pathname, '\n')
}

// ---------------------------------------------------------------- ASSERT (DB-Verify des Seed-Zustands)
async function assertSeedState() {
  const s = await loadSummary()
  const results = []
  const check = (name, ok, detail) => { results.push({ ok }); log(`  ${ok ? '✅' : '❌'} ${name}${detail != null ? ' — ' + detail : ''}`) }

  const { data: s1 } = await db
    .from('claims')
    .select('abrechnungsweg, reparaturwunsch, reparatur_werkstatt_id, reparatur_vermittlung_status')
    .eq('id', s.claimId).maybeSingle()
  check('S1: abrechnungsweg=selbstzahler', s1?.abrechnungsweg === 'selbstzahler', s1?.abrechnungsweg)
  check('S1: reparaturwunsch=fiktiv', s1?.reparaturwunsch === 'fiktiv', s1?.reparaturwunsch)
  check('S1: unzugewiesen (Finder erscheint)', s1?.reparatur_werkstatt_id == null && s1?.reparatur_vermittlung_status === 'offen', `ws=${s1?.reparatur_werkstatt_id} status=${s1?.reparatur_vermittlung_status}`)

  const { data: ws } = await db.from('werkstaetten').select('email, status').eq('id', s.smokeWerkstattId).maybeSingle()
  check('Werkstatt: email=NULL (nurEchte-sichtbar) + aktiv', ws?.email == null && ws?.status === 'aktiv', `email=${ws?.email} status=${ws?.status}`)

  const { data: s3 } = await db
    .from('claims').select('reparatur_werkstatt_id, reparatur_vermittlung_status').eq('id', s.s3ClaimId).maybeSingle()
  check('S3: der Smoke-Werkstatt zugewiesen (Portal-Auftrag)', s3?.reparatur_werkstatt_id === s.smokeWerkstattId && s3?.reparatur_vermittlung_status === 'vermittelt', `ws=${s3?.reparatur_werkstatt_id}`)

  // v_werkstatt_auftrag ist rollen-gefiltert (WHERE is_staff() OR is_werkstatt_for_claim — beide
  // prüfen auth.uid()) → via service_role (uid=NULL) IMMER leer, das ist KEIN Seed-Fehler.
  // is_werkstatt_for_claim prüft reparatur_werkstatt_id ODER werkstatt_id (MCP-verifiziert) → die
  // eingeloggte Wegwerf-Werkstatt sieht den S3-Claim. Die Portal-Sichtbarkeit beweist der Playwright-S3-Test.

  const passed = results.filter((r) => r.ok).length
  log(`\n  === ${passed}/${results.length} Assertions gruen ===\n`)
  if (passed < results.length) process.exitCode = 1
}

// ---------------------------------------------------------------- DISPATCH
async function main() {
  log(`\n== Werkstatt-Finder J10-Seed [${MODE.toUpperCase()}] gegen ${URL_} ==`)
  if (MODE === 'clean') { await clean(); log('  --clean fertig.\n'); return }
  if (MODE === 'assert') { await assertSeedState(); return }
  await clean() // frischer Start
  await seed()
}
main().catch((e) => { console.error('FEHLER:', e.message); process.exit(1) })
