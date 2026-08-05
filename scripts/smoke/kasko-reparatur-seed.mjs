// Fundament J5 (Kasko/Selbstzahler-Reparatur-Phase) — Service-Role Seed / Assert / Clean.
//
// Beweist (via kasko-reparatur-phase-smoke.spec.ts): die interne Fallakte eines Kasko-Claims mit
// gesetzter Werkstatt zeigt die REPARATUR-LANE (subPhase reparatur_terminfindung -> Stepper-Label
// "Terminfindung") und NICHT den Lead-Fallback "SA-Unterschrift offen" (#4471). Ersetzt den frueher
// fest verdrahteten prod-Claim 39734007 (zustandsgedriftet: werkstatt_id inzwischen NULL) durch
// einen bei JEDEM Lauf frisch geseedeten, deterministischen Zustand.
//
// subPhase-Ableitung (belegt, src/lib/claims/lifecycle.ts):
//   abrechnungsweg='kasko'         -> istDirectReparatur=true (:234-236, DIRECT_REPARATUR_WEGE :232)
//   reparatur_werkstatt_id gesetzt -> reparaturSubphase => 'reparatur_terminfindung' (:244)
//   operative_status='reparatur-angefragt' -> Cursor-Map (:204), belt-and-suspenders
//   KEINE reparatur_termine (bzw. status!='bestaetigt'/'erledigt') -> bleibt terminfindung (nicht laeuft/fertig)
//   KEIN erstgutachten-Auftrag / kein kanzlei_faelle -> milestone greift nicht vor der Direct-Weiche
//
// ISOLATION (Regel 4): Wegwerf-Konten @claimondo.test (telefon=NULL -> kein WhatsApp/SMS), eigene
// Wegwerf-Werkstatt (KEINE feste prod-Fixture -> kein Drift), Marker in schadenort_adresse -> --clean
// findet alles wieder. Beruehrt KEINE realen Claims/Werkstaetten auf prod.
//
// Nutzung (aus Repo-Root, node >= 18; env: process.env-first, .env.local nur lokal):
//   node scripts/smoke/kasko-reparatur-seed.mjs           # raeumt alte Reste + seedet frisch
//   node scripts/smoke/kasko-reparatur-seed.mjs --assert  # prueft den Seed-Zustand (DB)
//   node scripts/smoke/kasko-reparatur-seed.mjs --clean   # nur aufraeumen

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// --- env: process.env-first (CI hat kein .env.local), sonst .env.local (Prod-Mirror) ---
const ENV_CANDIDATES = [
  new URL('../../.env.local', import.meta.url), // Repo-Root (Haupt-Checkout)
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
const MARKER = 'SMOKE-KASKO Koeln (Test)'
const KOELN = { lat: 50.9413, lng: 6.9583, plz: '50667', ort: 'Köln' }
const OUT = new URL('./.kasko-reparatur-seed.json', import.meta.url)
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
  if (!existsSync(OUT)) throw new Error('.kasko-reparatur-seed.json fehlt — erst seeden.')
  return JSON.parse(readFileSync(OUT, 'utf8'))
}

// ---------------------------------------------------------------- CLEAN
async function clean(summary) {
  const s = summary ?? (existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null)
  // Marker-basiert: fange auch alte Reste ohne Summary.
  const { data: claims } = await db.from('claims').select('id').eq('schadenort_adresse', MARKER)
  const claimIds = [...new Set([...(claims ?? []).map((c) => c.id), ...(s ? [s.claimId] : [])].filter(Boolean))]
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
  if (s) {
    const zweiStd = new Date(Date.now() - 2 * 3600e3).toISOString()
    for (const uid of [s.kundeUid, s.werkstattUid].filter(Boolean)) {
      await db.from('mitteilungen').delete().eq('empfaenger_id', uid).gt('created_at', zweiStd)
    }
    if (s.werkstattUid) await db.from('werkstaetten').delete().eq('user_id', s.werkstattUid)
    for (const uid of [s.kundeUid, s.werkstattUid].filter(Boolean)) {
      await db.from('profiles').delete().eq('id', uid)
      await db.auth.admin.deleteUser(uid).catch(() => {})
    }
  }
  log(`  cleaned: ${claimIds.length} claim(s) + Konten/Werkstatt (Marker "${MARKER}")`)
}

// ---------------------------------------------------------------- SEED
async function seed() {
  const stamp = Date.now().toString(36) + '-' + randomUUID().slice(0, 8)
  const wsEmail = `throwaway-werkstatt-kasko-${stamp}@claimondo.test`
  const wsPw = `Thrw-${stamp}-Ws9!`
  const kEmail = `throwaway-kunde-kasko-${stamp}@claimondo.test`
  const kPw = `Thrw-${stamp}-Ku9!`

  // 1) Wegwerf-Konten: Werkstatt (fuer reparatur_werkstatt_id-FK) + Kunde (geschaedigter).
  const werkstattUid = await createUser(wsEmail, wsPw)
  await upsertProfile(werkstattUid, wsEmail, 'werkstatt', 'Smoke', 'Kasko')
  const kundeUid = await createUser(kEmail, kPw)
  await upsertProfile(kundeUid, kEmail, 'kunde', 'Smoke', 'KaskoKunde')

  // Eigene Wegwerf-Werkstatt (KEINE feste prod-Fixture -> kein Drift). status='aktiv' + verifiziert.
  const { data: ws, error: wErr } = await db
    .from('werkstaetten')
    .insert({
      user_id: werkstattUid,
      name: `SMOKE Kasko-Werkstatt ${stamp}`,
      status: 'aktiv',
      verifiziert: true,
      ist_freie_werkstatt: true,
      lat: KOELN.lat,
      lng: KOELN.lng,
      adresse_plz: KOELN.plz,
      adresse_ort: KOELN.ort,
      email: wsEmail,
      telefon: null,
    })
    .select('id')
    .single()
  if (wErr) throw new Error('werkstaetten insert: ' + wErr.message)
  const werkstattId = ws.id

  // 2) Kasko-Claim anlegen (minimal), dann auf die Terminfindungs-Lane verdrahten.
  const today = new Date().toISOString().slice(0, 10)
  const { data: claim, error: cErr } = await db
    .from('claims')
    .insert({
      geschaedigter_user_id: kundeUid,
      schadentag: today,
      abrechnungsweg: 'kasko', // -> istDirectReparatur=true (Reparatur-Lane statt Lead-Kaskade)
      reparaturwunsch: 'reparatur',
      schadenort_adresse: MARKER,
      schadenort_ort: KOELN.ort,
      schadenort_plz: KOELN.plz,
      schadenort_lat: KOELN.lat,
      schadenort_lng: KOELN.lng,
    })
    .select('id')
    .single()
  if (cErr) throw new Error('claim insert: ' + cErr.message)
  const claimId = claim.id

  // reparatur-angefragt + Werkstatt gesetzt, KEIN reparatur_termine -> subPhase reparatur_terminfindung.
  const { error: uErr } = await db
    .from('claims')
    .update({
      operative_status: 'reparatur-angefragt',
      reparatur_werkstatt_id: werkstattId,
      reparatur_vermittlung_status: 'vermittelt',
      onboarding_complete: true,
    })
    .eq('id', claimId)
  if (uErr) throw new Error('claim reparatur-update: ' + uErr.message)

  // 3) Bridge verifizieren (trg_sync_claims_to_bridge sollte sie angelegt haben; /faelle/[claimId]).
  let { data: bridge } = await db.from('faelle_claim_bridge').select('fall_id').eq('claim_id', claimId).maybeSingle()
  if (!bridge) {
    const { error: bErr } = await db.from('faelle_claim_bridge').insert({ claim_id: claimId, fall_id: claimId })
    if (bErr) throw new Error('bridge insert (Trigger legte keine an): ' + bErr.message)
    bridge = { fall_id: claimId }
    log('  ! Bridge manuell angelegt (Trigger inaktiv)')
  }
  const fallId = bridge.fall_id

  const summary = {
    stamp, claimId, fallId, werkstattId, werkstattUid, kundeUid,
    werkstattEmail: wsEmail, werkstattPw: wsPw, kundeEmail: kEmail, kundePw: kPw,
    fallakteUrl: `/faelle/${claimId}`,
    seededAt: new Date().toISOString(),
  }
  writeFileSync(OUT, JSON.stringify(summary, null, 2))
  log('\n  --- SEED FERTIG (Zustand: Kasko + Werkstatt gesetzt -> reparatur_terminfindung) ---')
  log('  Claim:', claimId, '(fall_id =', fallId + ')')
  log('  Interne Fallakte:', summary.fallakteUrl)
  log('  Summary ->', OUT.pathname, '\n')
}

// ---------------------------------------------------------------- ASSERT (DB-Verify des Seed-Zustands)
async function assertSeedState() {
  const s = await loadSummary()
  const results = []
  const check = (name, ok, detail) => { results.push({ ok }); log(`  ${ok ? '✅' : '❌'} ${name}${detail != null ? ' — ' + detail : ''}`) }

  const { data: claim } = await db
    .from('claims')
    .select('abrechnungsweg, operative_status, reparatur_werkstatt_id, reparatur_vermittlung_status')
    .eq('id', s.claimId)
    .maybeSingle()
  check('abrechnungsweg = kasko', claim?.abrechnungsweg === 'kasko', claim?.abrechnungsweg)
  check('reparatur_werkstatt_id gesetzt', claim?.reparatur_werkstatt_id === s.werkstattId, claim?.reparatur_werkstatt_id)
  check('operative_status = reparatur-angefragt', claim?.operative_status === 'reparatur-angefragt', claim?.operative_status)
  check('reparatur_vermittlung_status = vermittelt', claim?.reparatur_vermittlung_status === 'vermittelt', claim?.reparatur_vermittlung_status)

  const { data: termine } = await db.from('reparatur_termine').select('id, status').eq('claim_id', s.claimId)
  const bestaetigt = (termine ?? []).some((t) => t.status === 'bestaetigt' || t.status === 'erledigt')
  check('kein bestaetigter/erledigter Reparaturtermin (bleibt terminfindung)', !bestaetigt, `${(termine ?? []).length} Termin(e)`)

  const passed = results.filter((r) => r.ok).length
  log(`\n  === ${passed}/${results.length} Assertions gruen ===\n`)
  if (passed < results.length) process.exitCode = 1
}

// ---------------------------------------------------------------- DISPATCH
async function main() {
  log(`\n== Kasko-Reparatur J5-Seed [${MODE.toUpperCase()}] gegen ${URL_} ==`)
  if (MODE === 'clean') { await clean(); log('  --clean fertig.\n'); return }
  if (MODE === 'assert') { await assertSeedState(); return }
  await clean() // frischer Start
  await seed()
}
main().catch((e) => { console.error('FEHLER:', e.message); process.exit(1) })
