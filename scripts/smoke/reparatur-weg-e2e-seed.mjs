// Reparatur-WEG E2E-Smoke — operatives Soll des Selbstzahler-Reparatur-Wegs, VOLL per UI.
//
// Seedet NUR den realistischen AUSGANGSZUSTAND (Kunde hat gemeldet, Werkstatt ist vermittelt,
// Auftrag=kva_erst, VOR KVA) — den Zustand, den Schaden-Meldung + Werkstatt-Finder erzeugt haetten.
// Schritt 1-2 (Meldung/Finder) sind aktuell in fremder Arbeit (Distanz-Bug) -> Ausgangszustand geseedet.
// AB DA faehrt der Playwright-Spec ALLES per echter UI (kein Zustand mehr geseedet):
//   Werkstatt: KVA hochladen -> (Kunde: KVA freigeben -> Termin bestaetigen) -> Werkstatt: abschliessen
//   -> Kunde: Beleg + "abgeschlossen" in der Fallakte sehen.
//
// abrechnungsweg='selbstzahler' entsteht via derive_abrechnungsweg(service_typ, schuldfrage,
// eigene_versicherung, schadenart): schuldfrage='eigenverantwortung' + eigene_versicherung='nein'
// (auf dem LEAD). claims.abrechnungsweg='selbstzahler' zusaetzlich (Kunde-View liest es direkt).
// Fahrzeug noetig, sonst verdeckt der istFrueh-Hinweis die Werkstatt-KVA-Sektion.
//
// Regel 4: telefon=NULL, @claimondo.test-Wegwerf-Konten, Marker in schadenort_adresse.
//   node scripts/smoke/reparatur-weg-e2e-seed.mjs           # clean + seed Ausgangszustand
//   node scripts/smoke/reparatur-weg-e2e-seed.mjs --assert  # End-Zustand nach dem UI-Flow
//   node scripts/smoke/reparatur-weg-e2e-seed.mjs --clean

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const ENV_CANDIDATES = [
  new URL('../../.env.local', import.meta.url),
  'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local',
  '/var/www/claimondo-v2/.env.local',
]
let envRaw = null
for (const c of ENV_CANDIDATES) { try { envRaw = readFileSync(c, 'utf8'); break } catch { /* next */ } }
// CI (Fundament B2): kein .env.local im Runner -> Fallback auf process.env (Secrets im Workflow durchgereicht).
const env = {}
if (envRaw) {
  for (const line of envRaw.split('\n')) {
    const l = line.replace(/\r$/, '')
    if (!l.includes('=') || l.trimStart().startsWith('#')) continue
    const i = l.indexOf('='); env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) throw new Error('SUPABASE URL/SERVICE_ROLE_KEY fehlen (weder .env.local noch process.env)')
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const APP = 'https://app.claimondo.de'
const MARKER = 'SMOKE-REPWEG Koeln (Test)'
const FIN_MARKER = 'WBASMOKEREPWEG017'
const KOELN = { lat: 50.9413, lng: 6.9583, plz: '50667', ort: 'Köln' }
const OUT = new URL('./.reparatur-weg-e2e-seed.json', import.meta.url)
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
  throw new Error(`User ${email} nicht gefunden`)
}
async function upsertProfile(id, email, rolle, vorname, nachname) {
  const { error } = await db.from('profiles').upsert(
    { id, email, rolle, vorname, nachname, telefon: null, force_password_change: false }, { onConflict: 'id' })
  if (error) log('  ! profiles warn:', error.message)
}
const loadSummary = () => existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null

// ---------------------------------------------------------------- CLEAN
async function clean() {
  const s = loadSummary()
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
  await db.from('leads').delete().like('email', 'throwaway-kunde-repweg-%')
  await db.from('vehicles').delete().eq('fin', FIN_MARKER)
  // Marker-basiertes Konto-Cleanup — faengt AUCH verwaiste Konten frueherer Seeds (anderer
  // stamp); das Summary allein kennt nur den letzten Lauf.
  const { data: profs } = await db.from('profiles').select('id').like('email', 'throwaway-%repweg-%@claimondo.test')
  const uids = (profs ?? []).map((p) => p.id)
  for (const uid of uids) {
    // ALLE mitteilungen des Test-Kontos loeschen (auf empfaenger_id=uid gescopt = reines throwaway-
    // Konto, alle mitteilungen sind Test-Daten). KEIN <2h-Zeitfilter mehr: der liess bei einem
    // Cleanup >2h nach dem Seed die alten mitteilungen stehen -> FK-Block auf profiles.delete ->
    // verwaistes Test-Profil blieb auf prod liegen (Befund 30.07., manuell geraeumt).
    await db.from('mitteilungen').delete().eq('empfaenger_id', uid)
    await db.from('werkstaetten').delete().eq('user_id', uid)
    await db.from('profiles').delete().eq('id', uid)
    await db.auth.admin.deleteUser(uid).catch(() => {})
  }
  await db.from('werkstaetten').delete().like('name', 'SMOKE Reparatur-Werkstatt %') // Namens-Backstop
  log(`  cleaned: ${claimIds.length} claim(s) + lead/vehicle + ${uids.length} Konto/Satellit (Marker "${MARKER}")`)
}

// ---------------------------------------------------------------- SEED
async function seed() {
  const stamp = Date.now().toString(36) + '-' + randomUUID().slice(0, 8)
  const wsEmail = `throwaway-werkstatt-repweg-${stamp}@claimondo.test`
  const wsPw = `Thrw-${stamp}-Ws9!`
  const kEmail = `throwaway-kunde-repweg-${stamp}@claimondo.test`
  const kPw = `Thrw-${stamp}-Ku9!`

  const werkstattUid = await createUser(wsEmail, wsPw)
  await upsertProfile(werkstattUid, wsEmail, 'werkstatt', 'Smoke', 'Werkstatt')
  const kundeUid = await createUser(kEmail, kPw)
  await upsertProfile(kundeUid, kEmail, 'kunde', 'Smoke', 'RepWeg')

  const { data: ws, error: wErr } = await db.from('werkstaetten').insert({
    user_id: werkstattUid, name: `SMOKE Reparatur-Werkstatt ${stamp}`, status: 'aktiv',
    verifiziert: true, ist_freie_werkstatt: true, lat: KOELN.lat, lng: KOELN.lng,
    adresse_plz: KOELN.plz, adresse_ort: KOELN.ort, email: wsEmail, telefon: null,
  }).select('id').single()
  if (wErr) throw new Error('werkstaetten: ' + wErr.message)
  const werkstattId = ws.id

  const { data: veh, error: vErr } = await db.from('vehicles').insert({
    hersteller: 'BMW', modell_haupttyp: '320d', kennzeichen_aktuell: 'K-SM 4567', fin: FIN_MARKER,
  }).select('id').single()
  if (vErr) throw new Error('vehicles: ' + vErr.message)
  const vehicleId = veh.id

  // Lead: schuldfrage=eigenverantwortung + eigene_versicherung=nein -> derive => selbstzahler.
  const { data: lead, error: lErr } = await db.from('leads').insert({
    status: 'umgewandelt', schuldfrage: 'eigenverantwortung', eigene_versicherung: 'nein',
    vorname: 'Smoke', nachname: 'RepWeg', email: kEmail, telefon: null,
    reparaturwunsch: 'reparatur', freie_werkstattwahl: true, source_channel: 'werkstatt_finder',
    reparatur_werkstatt_id: werkstattId, reparatur_vermittlung_status: 'vermittelt',
    fahrzeug_hersteller: 'BMW', fahrzeug_modell: '320d',
  }).select('id').single()
  if (lErr) throw new Error('leads: ' + lErr.message)
  const leadId = lead.id

  const today = new Date().toISOString().slice(0, 10)
  const { data: claim, error: cErr } = await db.from('claims').insert({
    geschaedigter_user_id: kundeUid, lead_id: leadId, vehicle_id: vehicleId, schadentag: today,
    service_typ: 'komplett', abrechnungsweg: 'selbstzahler', reparaturwunsch: 'reparatur',
    schadenort_adresse: MARKER, schadenort_ort: KOELN.ort, schadenort_plz: KOELN.plz,
    schadenort_lat: KOELN.lat, schadenort_lng: KOELN.lng,
  }).select('id').single()
  if (cErr) throw new Error('claims: ' + cErr.message)
  const claimId = claim.id

  // Ausgangszustand: vermittelt, kva_erst, VOR KVA. reparatur-angefragt = nach Werkstatt-Wahl.
  const { error: uErr } = await db.from('claims').update({
    operative_status: 'reparatur-angefragt', reparatur_werkstatt_id: werkstattId,
    reparatur_vermittlung_status: 'vermittelt', reparatur_auftrag_modus: 'kva_erst',
    reparatur_werkstatt_quelle: 'embed', onboarding_complete: true,
  }).eq('id', claimId)
  if (uErr) throw new Error('claims-update: ' + uErr.message)

  let { data: bridge } = await db.from('faelle_claim_bridge').select('fall_id').eq('claim_id', claimId).maybeSingle()
  if (!bridge) {
    await db.from('faelle_claim_bridge').insert({ claim_id: claimId, fall_id: claimId })
    bridge = { fall_id: claimId }; log('  ! Bridge manuell')
  }

  const summary = {
    stamp, claimId, fallId: bridge.fall_id, werkstattId, werkstattUid, kundeUid, vehicleId, leadId,
    werkstattEmail: wsEmail, werkstattPw: wsPw, kundeEmail: kEmail, kundePw: kPw,
    werkstattAuftragUrl: `${APP}/werkstatt/auftraege/${claimId}`,
    kundeFallakteUrl: `${APP}/kunde/faelle/${claimId}`, seededAt: new Date().toISOString(),
  }
  writeFileSync(OUT, JSON.stringify(summary, null, 2))
  log('\n  --- AUSGANGSZUSTAND GESEEDET (vermittelt, kva_erst, VOR KVA) ---')
  log('  Claim:', claimId)
  log('  Werkstatt:', wsEmail, '/', wsPw, '->', summary.werkstattAuftragUrl)
  log('  Kunde:', kEmail, '/', kPw, '->', summary.kundeFallakteUrl)
  log('  Summary ->', OUT.pathname, '\n')
}

// ---------------------------------------------------------------- ASSERT (End-Zustand nach UI-Flow)
async function assertEnd() {
  const s = loadSummary(); if (!s) throw new Error('kein Seed-Summary')
  const { claimId, fallId } = s
  const R = []; const chk = (n, ok, d) => { R.push(ok); log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }

  const { data: c } = await db.from('claims').select('operative_status, abgeschlossen_am, geschlossen_grund, reparatur_freigegeben_am, kva_quelle, kostenvoranschlag_netto').eq('id', claimId).maybeSingle()
  chk('KVA hochgeladen (kva_quelle=werkstatt)', c?.kva_quelle === 'werkstatt', c?.kva_quelle)
  chk('Kunde-Freigabe (reparatur_freigegeben_am gesetzt)', !!c?.reparatur_freigegeben_am, c?.reparatur_freigegeben_am)
  chk('operative_status = abgeschlossen', c?.operative_status === 'abgeschlossen', c?.operative_status)
  chk('geschlossen_grund = reparatur_erledigt', c?.geschlossen_grund === 'reparatur_erledigt', c?.geschlossen_grund)

  const { data: t } = await db.from('reparatur_termine').select('status').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  chk('reparatur_termine.status = erledigt', t?.status === 'erledigt', t?.status)

  const { data: pt } = await db.from('phase_transitions').select('from_phase,to_phase').eq('fall_id', fallId)
  const hops = (pt ?? []).map((p) => `${p.from_phase}->${p.to_phase}`)
  chk('phase_transitions: -> reparatur-laeuft (Kunde bestaetigt Termin)', hops.some((h) => /->reparatur-laeuft$/.test(h)), hops.join(', '))
  chk('phase_transitions: -> abgeschlossen', hops.some((h) => /->abgeschlossen$/.test(h)))

  const { data: docs } = await db.from('fall_dokumente').select('dokument_typ').eq('claim_id', claimId)
  const typen = (docs ?? []).map((d) => d.dokument_typ)
  chk('Dokument: Kostenvoranschlag', typen.includes('kostenvoranschlag'), typen.join(', '))
  chk('Dokument: Schlussrechnung (Kunde-Beleg)', typen.includes('schlussrechnung'))

  const passed = R.filter(Boolean).length
  log(`\n  === ${passed}/${R.length} End-Assertions gruen ===\n`)
  if (passed < R.length) process.exitCode = 1
}

async function main() {
  log(`\n== Reparatur-WEG E2E [${MODE.toUpperCase()}] gegen ${URL_} ==`)
  if (MODE === 'clean') { await clean(); log('  fertig.\n'); return }
  if (MODE === 'assert') { await assertEnd(); return }
  await clean(); await seed()
}
main().catch((e) => { console.error('FEHLER:', e.message); process.exit(1) })
