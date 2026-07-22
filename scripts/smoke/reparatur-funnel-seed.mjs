// #4567 Reparatur-Funnel Regel-4-Prod-Smoke — Service-Role Seed / Assert / Clean.
//
// Beweist: der Werkstatt-Reparatur-Abschluss (markiereReparaturErledigt) laeuft durch die
// State-Machine (closeReparaturClaimViaEngine) statt per Direkt-.update() — inkl. Cursor-Walk
// reparatur-laeuft -> reparatur-erledigt -> abgeschlossen, Timeline + phase_transitions je Hop,
// abgeschlossen_am + geschlossen_grund='reparatur_erledigt', Werkstatt-Provision -> freigegeben.
//
// ISOLATION (Regel 4): Wegwerf-Konten @claimondo.test (istInterneEmail erkennt .test),
// telefon=NULL (kein WhatsApp/SMS an echte Nummern), Marker in schadenort_adresse -> --clean
// findet alles wieder. KEIN Anfassen der 3 realen selbstzahler/kasko-Claims auf prod.
//
// Nutzung (aus Repo-Root, node >= 18):
//   node scripts/smoke/reparatur-funnel-seed.mjs           # raeumt alte Reste + seedet frisch bis reparatur-laeuft
//   node scripts/smoke/reparatur-funnel-seed.mjs --assert  # prueft den Abschluss-Endzustand (nach dem UI-Drive)
//   node scripts/smoke/reparatur-funnel-seed.mjs --clean   # nur aufraeumen

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// --- env aus .env.local (Prod-Mirror) — Worktree hat keine, Haupt-Checkout schon ---
const ENV_CANDIDATES = [
  new URL('../../.env.local', import.meta.url), // Repo-Root (Haupt-Checkout)
  'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local',
  '/var/www/claimondo-v2/.env.local',
]
let envRaw = null
for (const c of ENV_CANDIDATES) {
  try { envRaw = readFileSync(c, 'utf8'); break } catch { /* naechster */ }
}
if (!envRaw) throw new Error('.env.local in keinem Kandidaten gefunden: ' + ENV_CANDIDATES.join(', '))
const env = {}
for (const line of envRaw.split('\n')) {
  const l = line.replace(/\r$/, '')
  if (!l.includes('=') || l.trimStart().startsWith('#')) continue
  const i = l.indexOf('=')
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in .env.local')
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// --- Konstanten ---
const APP = 'https://app.claimondo.de'
const MARKER = 'SMOKE-REPFUNNEL Koeln (Test)'
const KOELN = { lat: 50.9413, lng: 6.9583, plz: '50667', ort: 'Köln' }
const OUT = new URL('./.reparatur-funnel-seed.json', import.meta.url)
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
  if (!existsSync(OUT)) throw new Error('.reparatur-funnel-seed.json fehlt — erst seeden.')
  return JSON.parse(readFileSync(OUT, 'utf8'))
}

// ---------------------------------------------------------------- CLEAN
async function clean(summary) {
  const s = summary ?? (existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null)
  // Marker-basiert: fange auch alte Reste ohne Summary.
  const { data: claims } = await db.from('claims').select('id').eq('schadenort_adresse', MARKER)
  const claimIds = [...new Set([...(claims ?? []).map((c) => c.id), ...(s ? [s.claimId] : [])].filter(Boolean))]
  for (const cid of claimIds) {
    // Storage: Schlussrechnung(en) unter <fallId=claimId>/ im fall-dokumente-Bucket (die
    // DB-Zeile allein reicht nicht — die Datei bliebe sonst als Residue liegen).
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
  log(`  cleaned: ${claimIds.length} claim(s) + Konten/Satelliten (Marker "${MARKER}")`)
}

// ---------------------------------------------------------------- SEED
async function seed() {
  const stamp = Date.now().toString(36) + '-' + randomUUID().slice(0, 8)
  const wsEmail = `throwaway-werkstatt-repfunnel-${stamp}@claimondo.test`
  const wsPw = `Thrw-${stamp}-Ws9!`
  const kEmail = `throwaway-kunde-repfunnel-${stamp}@claimondo.test`
  const kPw = `Thrw-${stamp}-Ku9!`

  // 1) Werkstatt-Konto (Portal-Login) + Kunde-Konto (geschaedigter, kein Login noetig)
  const werkstattUid = await createUser(wsEmail, wsPw)
  await upsertProfile(werkstattUid, wsEmail, 'werkstatt', 'Smoke', 'Werkstatt')
  const kundeUid = await createUser(kEmail, kPw)
  await upsertProfile(kundeUid, kEmail, 'kunde', 'Smoke', 'RepFunnel')

  // werkstaetten-Zeile: status='aktiv' (Portal-Gate) + verifiziert + Koordinaten (View-defensiv).
  const { data: ws, error: wErr } = await db
    .from('werkstaetten')
    .insert({
      user_id: werkstattUid,
      name: `SMOKE Reparatur-Werkstatt ${stamp}`,
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

  // 2) Claim anlegen (minimal), dann auf reparatur-laeuft + Werkstatt verdrahten.
  const today = new Date().toISOString().slice(0, 10)
  const { data: claim, error: cErr } = await db
    .from('claims')
    .insert({
      geschaedigter_user_id: kundeUid,
      schadentag: today,
      abrechnungsweg: 'kasko', // reduced-repair-Achse (darfReparaturAdvancen)
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

  // reparatur-laeuft = Zustand nach Termin-Bestaetigung (Werkstatt klickt hier "erledigt").
  const { error: uErr } = await db
    .from('claims')
    .update({
      operative_status: 'reparatur-laeuft',
      reparatur_werkstatt_id: werkstattId,
      reparatur_vermittlung_status: 'vermittelt',
      reparatur_auftrag_modus: 'direkt',
      reparatur_freigegeben_am: new Date().toISOString(),
      onboarding_complete: true,
    })
    .eq('id', claimId)
  if (uErr) throw new Error('claim reparatur-update: ' + uErr.message)

  // 3) Bridge verifizieren (trg_sync_claims_to_bridge sollte sie angelegt haben).
  let { data: bridge } = await db.from('faelle_claim_bridge').select('fall_id').eq('claim_id', claimId).maybeSingle()
  if (!bridge) {
    const { error: bErr } = await db.from('faelle_claim_bridge').insert({ claim_id: claimId, fall_id: claimId })
    if (bErr) throw new Error('bridge insert (Trigger legte keine an): ' + bErr.message)
    bridge = { fall_id: claimId }
    log('  ! Bridge manuell angelegt (Trigger inaktiv)')
  }
  const fallId = bridge.fall_id

  // 4) reparatur_termine: bestaetigt (Vorbedingung istReparaturClaimAbschliessbar).
  const morgen = new Date(Date.now() + 864e5).toISOString()
  const { error: tErr } = await db.from('reparatur_termine').insert({
    claim_id: claimId,
    werkstatt_id: werkstattId,
    status: 'bestaetigt',
    bestaetigter_termin: morgen,
    wunschtermin: morgen,
    erstellt_von: kundeUid,
  })
  if (tErr) throw new Error('reparatur_termine insert: ' + tErr.message)

  // 5) Provision verifizieren (trg_werkstatt_provision_on_claim). Sonst manuell pending.
  let { data: prov } = await db
    .from('partner_provisionen')
    .select('id, status, partner_typ')
    .eq('claim_id', claimId)
    .eq('partner_typ', 'werkstatt')
    .maybeSingle()
  if (!prov) {
    const { error: pErr } = await db.from('partner_provisionen').insert({
      claim_id: claimId,
      fall_id: fallId,
      partner_typ: 'werkstatt',
      partner_id: werkstattId,
      status: 'pending',
      service_typ: 'reparatur',
    })
    if (pErr) log('  ! Provision manuell-insert warn:', pErr.message)
    else log('  Provision manuell als pending angelegt (Trigger legte keine an)')
  } else {
    log(`  Provision via Trigger: status=${prov.status} (Erwartung vor Abschluss: pending)`)
  }

  // 6) v_werkstatt_auftrag-Sichtbarkeit (Service-Role — RLS umgangen, aber View-Filter greift).
  const { data: viewRow, error: vErr } = await db
    .from('v_werkstatt_auftrag')
    .select('claim_id')
    .eq('claim_id', claimId)
    .maybeSingle()
  const viewVisible = !!viewRow && !vErr

  const summary = {
    stamp, claimId, fallId, werkstattId, werkstattUid, kundeUid,
    werkstattEmail: wsEmail, werkstattPw: wsPw, kundeEmail: kEmail,
    auftragUrl: `${APP}/werkstatt/auftraege/${claimId}`,
    viewVisible,
    seededAt: new Date().toISOString(),
  }
  writeFileSync(OUT, JSON.stringify(summary, null, 2))
  log('\n  --- SEED FERTIG (Zustand: reparatur-laeuft, Termin bestaetigt) ---')
  log('  Claim:', claimId, '(fall_id =', fallId + ')')
  log('  Werkstatt-Login:', wsEmail, '/', wsPw)
  log('  Auftrag-URL:', summary.auftragUrl)
  log('  v_werkstatt_auftrag sichtbar:', viewVisible ? 'JA ✅' : 'NEIN ⚠ (Portal-Drive blockiert!)')
  log('  Summary ->', OUT.pathname, '\n')
}

// ---------------------------------------------------------------- ASSERT
async function assertEndzustand() {
  const s = await loadSummary()
  const { claimId, fallId } = s
  const results = []
  const check = (name, ok, detail) => { results.push({ name, ok, detail }); log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`) }

  const { data: claim } = await db
    .from('claims')
    .select('operative_status, abgeschlossen_am, geschlossen_grund')
    .eq('id', claimId)
    .maybeSingle()
  check('claims.operative_status = abgeschlossen', claim?.operative_status === 'abgeschlossen', claim?.operative_status)
  check('claims.abgeschlossen_am gesetzt', !!claim?.abgeschlossen_am, claim?.abgeschlossen_am)
  check('claims.geschlossen_grund = reparatur_erledigt', claim?.geschlossen_grund === 'reparatur_erledigt', claim?.geschlossen_grund)

  const { data: tl } = await db
    .from('timeline')
    .select('titel')
    .eq('fall_id', fallId)
    .eq('typ', 'status-change')
  const titel = (tl ?? []).map((t) => t.titel)
  check('timeline: Hop -> reparatur-erledigt', titel.some((t) => /reparatur-erledigt/.test(t)), titel.join(' | '))
  check('timeline: Hop -> abgeschlossen', titel.some((t) => /→ abgeschlossen/.test(t)), `${titel.length} status-change-Eintraege`)

  const { data: pt } = await db
    .from('phase_transitions')
    .select('from_phase, to_phase')
    .eq('fall_id', fallId)
  const hops = (pt ?? []).map((p) => `${p.from_phase}->${p.to_phase}`)
  check('phase_transitions: -> reparatur-erledigt', hops.some((h) => /->reparatur-erledigt$/.test(h)), hops.join(', '))
  check('phase_transitions: -> abgeschlossen', hops.some((h) => /->abgeschlossen$/.test(h)))

  const { data: prov } = await db
    .from('partner_provisionen')
    .select('status')
    .eq('claim_id', claimId)
    .eq('partner_typ', 'werkstatt')
    .maybeSingle()
  check('partner_provisionen(werkstatt).status = freigegeben', prov?.status === 'freigegeben', prov?.status ?? 'keine Zeile')

  const { data: doc } = await db
    .from('fall_dokumente')
    .select('id')
    .eq('claim_id', claimId)
    .eq('dokument_typ', 'schlussrechnung')
    .maybeSingle()
  check('fall_dokumente: schlussrechnung vorhanden', !!doc)

  const { data: term } = await db.from('reparatur_termine').select('status').eq('claim_id', claimId).maybeSingle()
  check('reparatur_termine.status = erledigt', term?.status === 'erledigt', term?.status)

  const passed = results.filter((r) => r.ok).length
  log(`\n  === ${passed}/${results.length} Assertions gruen ===\n`)
  if (passed < results.length) process.exitCode = 1
}

// ---------------------------------------------------------------- DISPATCH
async function main() {
  log(`\n== Reparatur-Funnel Smoke [${MODE.toUpperCase()}] gegen ${URL_} ==`)
  if (MODE === 'clean') { await clean(); log('  --clean fertig.\n'); return }
  if (MODE === 'assert') { await assertEndzustand(); return }
  await clean() // frischer Start
  await seed()
}
main().catch((e) => { console.error('FEHLER:', e.message); process.exit(1) })
