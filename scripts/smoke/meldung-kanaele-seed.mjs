// Fundament J2 (Meldung ueber alle Kanaele) — Service-Role Seed / Assert / Clean.
//
// Beweist (via meldung-kanaele-smoke.spec.ts) DREI Meldewege = die drei Melde-Muster aus j02:
//   A · Kunde-Wizard /kunde/schaden-melden (eingeloggt, Wrapper convertLeadToFall):
//       Ein-Formular, Pflicht nur PLZ, KEINE Terminwahl, kein reserviere() —
//       schreibt leads(source_channel='kunde_portal') + claims + pflichtdokumente (actions.ts:17
//       -> createLead -> convert-lead-to-fall.ts:75,172).
//   B · POST /api/v1/melde-schaden (anon API, lead-first): gutachter_finder_anfragen(source='mcp')
//       + leads + flow_links (route.ts:90,185,219). OHNE sv_id/slot_start/slot_end KEINE
//       Reservierung (:240). 2. POST gleiche Nummer -> status='bereits_angelegt' (Dedup :123)
//       = j02-Soll "idempotent" empirisch.
//   C · Gegner-Schadenkarte /schaden/[token] (anon QR/NFC, Kern-direkt): Direkt-Claim MIT
//       pflichtdokumenten (C2b-1, 11.08.: der Kern convertLeadToClaim legt die Slots jetzt selbst
//       an -> j02-IST-Delta #2 geschlossen), verursacher-Party, VS-Fallback-Task.
//
// ISOLATION (Regel 4, identitaetsbasiert — SIDE_EFFECT_MODE erreicht den prod-Prozess nicht):
//   A: Wegwerf-Kunde @claimondo.test + profiles.telefon=NULL -> sendFallCommunication
//      (fall_eroeffnet) hat weder WA- noch Email-Empfaenger (send.ts:31,64-81).
//   B: Drama-Festnetznummer +49 30 23125xxx (Bundesnetzagentur-Fiktionsrange, je Lauf variiert
//      gegen phone-cap 3/24h + Cross-Run-Dedup) -> WA-Precheck false, SMS inert, kein
//      Email-Feld im Payload -> kanal='none' (der Spec ASSERTED kanal==='none' als
//      Runtime-Isolations-Beweis). KEIN sv_id/slot -> keine Reservierung an echte SVs.
//   C: Submit OHNE Telefon (Airdrop nur if(telefon), actions.ts:231 -> stattdessen interner
//      vs_meldung-Task) + Wegwerf-Firma OHNE firmen_flotten_konten-Zeile -> FM-WA-Nummern
//      leer (konto-firma.ts:50-60) -> kein FM-Send. ⚠ Der Spec waehlt NIE einen Versicherer
//      (VS-Meldung ist prod-scharf — STOP-Marker firmen-flotte) und bestaetigt /unfallmeldung NICHT.
//
// Self-cleaning: Marker 'SMOKE-J2' in Namen/Kennzeichen + Email-Praefix; seed ruft erst clean.
// FK-Reihenfolgen (MCP-verifiziert): gfa VOR leads (konvertiert_zu_lead_id NO ACTION) ·
// tasks.lead_id VOR leads (kein CASCADE) · vehicles NACH claims (claims.vehicle_id RESTRICT) ·
// personen NACH claims (claim_parties.person_id SET NULL laesst sie sonst verwaist).
// consent_records (Kanal B) traegt KEINE Subjekt-Referenz (Befund B8) -> nicht zuordenbar,
// bleibt stehen (1 anonyme Audit-Zeile je Lauf).
//
// Nutzung (aus Repo-Root, node >= 18; env process.env-first, .env.local nur lokal):
//   node scripts/smoke/meldung-kanaele-seed.mjs           # raeumt NUR ALTE Reste (>30 Min) + seedet frisch
//                                                          (Race-Guard: ein paralleler Lauf bleibt unberuehrt)
//   node scripts/smoke/meldung-kanaele-seed.mjs --assert  # prueft alle 3 Kanal-Endzustaende
//   node scripts/smoke/meldung-kanaele-seed.mjs --clean   # nur aufraeumen

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
const KUNDE_PREFIX = 'throwaway-kunde-meldung-'
const API_VORNAME = 'SMOKE-J2-API' // splitName: name = "SMOKE-J2-API <stamp>" -> vorname exakt dieser Marker
const FIRMA_NAME = 'SMOKE-J2-Flotte (Test)'
const KENNZEICHEN_FIXTURE = 'SMOKE-J2 001' // Flotten-Fahrzeug der Karte
const KARTE_PREFIX = 'SKT-SMOKEJ2-'
const OUT = new URL('./.meldung-kanaele-seed.json', import.meta.url)
const MODE = process.argv.includes('--clean') ? 'clean' : process.argv.includes('--assert') ? 'assert' : 'seed'
const log = (...a) => console.log(...a)
const ids = (rows, k = 'id') => [...new Set((rows ?? []).map((r) => r[k]).filter(Boolean))]

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

// ---------------------------------------------------------------- CLEAN
// Auf `leads.id` zeigen drei FKs OHNE CASCADE — sie muessen VOR dem Lead-Delete weg, sonst
// scheitert er an der FK-Verletzung. `tasks` war bekannt; `gutachter_termine` fehlte in BEIDEN
// Raeum-Pfaden und blockierte real 88 Leads (04.–16.08.) — der J2-Journey ERZEUGT einen Termin,
// der Blocker entsteht also bei jedem Lauf zwangslaeufig. `whatsapp_inbound_messages` ist hier
// nie belegt (0 Zeilen), wird der Vollstaendigkeit halber aber mitgeraeumt.
// Termine haengen an der Legacy-Achse (`lead_id`, 88/88 geprueft) — bezug-native Termine
// (lead_id NULL) blockieren den FK nicht, werden ueber `bezug_id` aber ebenfalls entfernt,
// damit kein Residue zurueckbleibt.
async function entferneLeadBlocker(leadIds) {
  if (!leadIds.length) return
  await db.from('tasks').delete().in('lead_id', leadIds)
  await db.from('gutachter_termine').delete().in('lead_id', leadIds)
  await db.from('gutachter_termine').delete().in('bezug_id', leadIds).eq('bezug_typ', 'lead')
  await db.from('whatsapp_inbound_messages').delete().in('matched_lead_id', leadIds)
}

// Der Lead-Delete lief bisher ohne Fehlerpruefung — Supabase WIRFT bei FK-Verletzung nicht,
// sondern liefert `{ error }`. Genau deshalb blieb der Rueckstand 13 Tage lang unbemerkt:
// der Seed meldete Erfolg, waehrend jeder Lauf einen Lead zurueckliess.
async function loescheLeads(leadIds) {
  if (!leadIds.length) return
  const { error } = await db.from('leads').delete().in('id', leadIds)
  if (error) console.error(`[clean] leads-DELETE fehlgeschlagen (${leadIds.length} Ids): ${error.message}`)
}

// Loescht die Claim-Kette einer Menge von claim-/lead-Ids in FK-sicherer Reihenfolge.
async function cleanClaimKette(claimIds, leadIds) {
  let fallIds = []
  let personIds = []
  let vehicleIds = []
  if (claimIds.length) {
    const { data: bridge } = await db.from('faelle_claim_bridge').select('fall_id').in('claim_id', claimIds)
    fallIds = ids(bridge, 'fall_id')
    const { data: parties } = await db.from('claim_parties').select('person_id').in('claim_id', claimIds)
    personIds = ids(parties, 'person_id')
    const { data: cl } = await db.from('claims').select('vehicle_id').in('id', claimIds)
    vehicleIds = ids(cl, 'vehicle_id')
  }
  // partner_provisionen (Weg-7-Audit: firmen_flotte/pending entsteht) — alle drei Bezuege.
  if (claimIds.length) await db.from('partner_provisionen').delete().in('claim_id', claimIds)
  if (fallIds.length) await db.from('partner_provisionen').delete().in('fall_id', fallIds)
  if (leadIds.length) await db.from('partner_provisionen').delete().in('lead_id', leadIds)
  await entferneLeadBlocker(leadIds) // tasks/gutachter_termine/wa-inbound: kein CASCADE auf lead_id
  const fallScope = [...new Set([...fallIds, ...claimIds])]
  if (fallScope.length) {
    await db.from('timeline').delete().in('fall_id', fallScope)
    await db.from('phase_transitions').delete().in('fall_id', fallScope)
  }
  if (claimIds.length) await db.from('claims').delete().in('id', claimIds) // CASCADE: parties/pflichtdok/bridge/tasks
  if (personIds.length) await db.from('personen').delete().in('id', personIds)
  if (vehicleIds.length) await db.from('vehicles').delete().in('id', vehicleIds) // nach claims (RESTRICT); leads.vehicle_id SET NULL
  await loescheLeads(leadIds) // flow_links CASCADE
}

// RACE-GUARD (11.08.): `nurAlte=true` (Seed-Start) raeumt NUR Fixtures aelter als GRACE_MS.
// Warum: alle Laeufe teilen sich die festen Praefixe — ein paralleler Seed-Start raeumte sonst die
// FRISCHEN Fixtures des anderen Laufs mit. Real beobachtet 11.08.: Auth-API `400 invalid_credentials`
// fuer den gerade geseedeten Kunden + 2 statt 1 `SMOKE-J2-Flotte`-Firmen -> Smoke-Test A scheiterte
// am Login, C am Karten-Fixture (beides KEIN Produktfehler, nur zerstoerter Ausgangszustand).
// Explizites `--clean` raeumt weiterhin ALLES (nurAlte=false) — das ist der Aufraeum-Modus.
// CI ist zusaetzlich durch die concurrency-Group `prod-e2e-smoke` (#4911) serialisiert; dieser
// Guard schuetzt den Fall CI-vs-lokale-Session (den die Group NICHT abdeckt).
const GRACE_MS = 30 * 60_000
const alterFilter = (query, spalte, nurAlte) =>
  nurAlte ? query.lt(spalte, new Date(Date.now() - GRACE_MS).toISOString()) : query

async function clean(nurAlte = false) {
  let n = { gfa: 0, leads: 0, claims: 0, konten: 0, fixtures: 0 }

  // --- Kanal B: gfa (VOR leads — konvertiert_zu_lead_id NO ACTION) + konvertierte Leads ---
  const { data: gfaRows } = await alterFilter(
    db.from('gutachter_finder_anfragen').select('id, konvertiert_zu_lead_id').ilike('vorname', `${API_VORNAME}%`),
    'erstellt_am',
    nurAlte,
  )
  const { data: apiLeads } = await alterFilter(
    db.from('leads').select('id').ilike('vorname', `${API_VORNAME}%`),
    'created_at',
    nurAlte,
  )
  const leadIdsB = [...new Set([...ids(gfaRows, 'konvertiert_zu_lead_id'), ...ids(apiLeads)])]
  await entferneLeadBlocker(leadIdsB)
  if (gfaRows?.length) await db.from('gutachter_finder_anfragen').delete().in('id', ids(gfaRows))
  await loescheLeads(leadIdsB)
  n.gfa = (gfaRows ?? []).length
  n.leads += leadIdsB.length

  // --- Kanal A: alles am Wegwerf-Kunden ---
  const { data: profs } = await alterFilter(
    db.from('profiles').select('id').ilike('email', `${KUNDE_PREFIX}%@claimondo.test`),
    'created_at',
    nurAlte,
  )
  const uids = ids(profs)
  if (uids.length) {
    const { data: aLeads } = await db.from('leads').select('id').in('kunde_id', uids)
    const leadIdsA = ids(aLeads)
    const { data: c1 } = await db.from('claims').select('id').in('geschaedigter_user_id', uids)
    const c2 = leadIdsA.length
      ? (await db.from('claims').select('id').in('lead_id', leadIdsA)).data
      : []
    const claimIdsA = [...new Set([...ids(c1), ...ids(c2)])]
    await cleanClaimKette(claimIdsA, leadIdsA)
    n.claims += claimIdsA.length
    n.leads += leadIdsA.length
  }

  // --- Kanal C: Kette ueber das Fixture-Fahrzeug (lead.vehicle_id) ---
  const { data: fixtureVehicles } = await alterFilter(
    db.from('vehicles').select('id').ilike('kennzeichen_aktuell', 'SMOKE-J2%'),
    'created_at',
    nurAlte,
  )
  const fixtureVehicleIds = ids(fixtureVehicles)
  if (fixtureVehicleIds.length) {
    const { data: cLeads } = await db
      .from('leads')
      .select('id')
      .eq('source_channel', 'schaden-karte')
      .in('vehicle_id', fixtureVehicleIds)
    const leadIdsC = ids(cLeads)
    const claimIdsC = leadIdsC.length
      ? ids((await db.from('claims').select('id').in('lead_id', leadIdsC)).data)
      : []
    await cleanClaimKette(claimIdsC, leadIdsC)
    n.claims += claimIdsC.length
    n.leads += leadIdsC.length
  }

  // --- Fixtures: Karte -> Fixture-Fahrzeug -> Firma (FKs SET NULL, Reihenfolge trotzdem sauber) ---
  const { data: karten } = await alterFilter(
    db.from('schadenkarten').select('id').ilike('karten_token', `${KARTE_PREFIX}%`),
    'erstellt_am',
    nurAlte,
  )
  if (karten?.length) await db.from('schadenkarten').delete().in('id', ids(karten))
  if (fixtureVehicleIds.length) await db.from('vehicles').delete().in('id', fixtureVehicleIds)
  const { data: firmen } = await alterFilter(
    db.from('firmen').select('id').eq('name', FIRMA_NAME),
    'created_at',
    nurAlte,
  )
  if (firmen?.length) await db.from('firmen').delete().in('id', ids(firmen))
  n.fixtures = (karten ?? []).length + fixtureVehicleIds.length + (firmen ?? []).length

  // --- Wegwerf-Konten ---
  for (const uid of uids) {
    await db.from('mitteilungen').delete().eq('empfaenger_id', uid)
    await db.from('profiles').delete().eq('id', uid)
    await db.auth.admin.deleteUser(uid).catch(() => {})
    n.konten++
  }

  log(`  cleaned: ${n.gfa} gfa + ${n.leads} lead(s) + ${n.claims} claim-Kette(n) + ${n.fixtures} Fixture(s) + ${n.konten} Konto/en`)
}

// ---------------------------------------------------------------- SEED
async function seed() {
  const stamp = Date.now().toString(36) + '-' + randomUUID().slice(0, 8)

  // A · Wegwerf-Kunde (telefon=NULL via upsert — Isolations-Anker)
  const kundeEmail = `${KUNDE_PREFIX}${stamp}@claimondo.test`
  const kundePw = `Thrw-${stamp}-Me9!`
  const kundeUid = await createUser(kundeEmail, kundePw)
  const { error: pErr } = await db.from('profiles').upsert(
    { id: kundeUid, email: kundeEmail, rolle: 'kunde', vorname: 'Smoke', nachname: 'MeldungKunde', telefon: null, force_password_change: false },
    { onConflict: 'id' },
  )
  if (pErr) log('  ! profiles-upsert warn:', pErr.message)

  // C · Wegwerf-Flotte: Firma (OHNE firmen_flotten_konten -> 0 FM-WA-Nummern) + Fahrzeug + Karte
  const { data: firma, error: fErr } = await db.from('firmen').insert({ name: FIRMA_NAME }).select('id').single()
  if (fErr) throw new Error('firmen insert: ' + fErr.message)
  const { data: vehicle, error: vErr } = await db
    .from('vehicles')
    .insert({ kennzeichen_aktuell: KENNZEICHEN_FIXTURE, hersteller: 'VW', modell_haupttyp: 'Golf' })
    .select('id')
    .single()
  if (vErr) throw new Error('vehicles insert: ' + vErr.message)
  const kartenToken = `${KARTE_PREFIX}${stamp.replace(/[^a-z0-9]/gi, '').toUpperCase()}`
  const { error: kErr } = await db
    .from('schadenkarten')
    .insert({ karten_token: kartenToken, status: 'gebunden', fahrzeug_id: vehicle.id, firma_id: firma.id })
  if (kErr) throw new Error('schadenkarten insert: ' + kErr.message)

  // B · API-Identitaet: Marker-Name + Drama-Festnetznummer (BNetzA-Fiktionsrange 030 23125000-999),
  // je Lauf variiert -> kein Cross-Run-Dedup/phone-cap; niemand Echtes erreichbar.
  const apiName = `${API_VORNAME} ${stamp}`
  const apiTelefon = `+49302312${5000 + Math.floor(Math.random() * 999)}`.slice(0, 14) // +49 30 23125xxx

  const summary = {
    stamp,
    kundeUid, kundeEmail, kundePw,
    firmaId: firma.id, vehicleId: vehicle.id, kartenToken,
    kartenUrl: `/schaden/${kartenToken}`,
    apiName, apiTelefon,
    seededAt: new Date().toISOString(),
  }
  writeFileSync(OUT, JSON.stringify(summary, null, 2))
  log('\n  --- SEED FERTIG (J2: Kunde + Schadenkarte-Fixture + API-Identitaet) ---')
  log('  A Kunde:  ', kundeEmail)
  log('  B API:    ', apiName, '/', apiTelefon)
  log('  C Karte:  ', summary.kartenUrl, `(Firma ${firma.id}, Fahrzeug ${vehicle.id})`)
  log('  Summary ->', OUT.pathname, '\n')
}

// ---------------------------------------------------------------- ASSERT (nach UI/API-Lauf)
async function assertKanaele() {
  if (!existsSync(OUT)) throw new Error('.meldung-kanaele-seed.json fehlt — erst seeden.')
  const s = JSON.parse(readFileSync(OUT, 'utf8'))
  const results = []
  const check = (name, ok, detail) => { results.push({ ok }); log(`  ${ok ? '✅' : '❌'} ${name}${detail != null ? ' — ' + detail : ''}`) }

  // A · Kunde-Wizard
  const { data: aLead } = await db
    .from('leads').select('id, source_channel').eq('kunde_id', s.kundeUid).maybeSingle()
  check("A lead.source_channel='kunde_portal'", aLead?.source_channel === 'kunde_portal', aLead?.source_channel)
  const { data: aClaim } = await db
    .from('claims').select('id, operative_status').eq('geschaedigter_user_id', s.kundeUid).maybeSingle()
  check('A claim existiert (geschaedigter_user_id)', !!aClaim?.id, aClaim?.id)
  const { count: pflichtCount } = aClaim?.id
    ? await db.from('pflichtdokumente').select('id', { count: 'exact', head: true }).eq('claim_id', aClaim.id)
    : { count: 0 }
  check('A pflichtdokumente >= 1 (Wrapper-Nachwirkung)', (pflichtCount ?? 0) >= 1, `count=${pflichtCount}`)

  // B · API
  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select('id, source, konvertiert_zu_lead_id, dsgvo_zustimmung_am')
    .eq('telefon', s.apiTelefon)
  check('B genau 1 gfa-Row (Dedup haelt)', (gfa ?? []).length === 1, `count=${(gfa ?? []).length}`)
  const g = gfa?.[0]
  check("B gfa.source='mcp' + dsgvo_zustimmung_am", g?.source === 'mcp' && !!g?.dsgvo_zustimmung_am)
  check('B gfa konvertiert (lead angelegt)', !!g?.konvertiert_zu_lead_id, g?.konvertiert_zu_lead_id)
  const { count: flCount } = g?.konvertiert_zu_lead_id
    ? await db.from('flow_links').select('id', { count: 'exact', head: true }).eq('lead_id', g.konvertiert_zu_lead_id)
    : { count: 0 }
  check('B flow_link existiert (FlowLink-Nachwirkung)', (flCount ?? 0) >= 1, `count=${flCount}`)

  // C · Schadenkarte
  const { data: cLead } = await db
    .from('leads')
    .select('id, source_channel, schuldfrage')
    .eq('source_channel', 'schaden-karte')
    .eq('vehicle_id', s.vehicleId)
    .maybeSingle()
  check("C lead (source_channel='schaden-karte', schuldfrage='gegner')", !!cLead?.id && cLead?.schuldfrage === 'gegner', cLead?.schuldfrage)
  const { data: cClaim } = cLead?.id
    ? await db.from('claims').select('id').eq('lead_id', cLead.id).maybeSingle()
    : { data: null }
  check('C Direkt-Claim existiert (Kern-Konvert)', !!cClaim?.id, cClaim?.id)
  const { count: partyCount } = cClaim?.id
    ? await db.from('claim_parties').select('id', { count: 'exact', head: true }).eq('claim_id', cClaim.id)
    : { count: 0 }
  check('C claim_parties >= 2 (geschaedigter + verursacher)', (partyCount ?? 0) >= 2, `count=${partyCount}`)
  const { count: vsTaskCount } = cClaim?.id
    ? await db.from('tasks').select('id', { count: 'exact', head: true }).eq('claim_id', cClaim.id).eq('typ', 'vs_meldung')
    : { count: 0 }
  check("C interner Fallback-Task typ='vs_meldung' (kein Telefon)", (vsTaskCount ?? 0) >= 1, `count=${vsTaskCount}`)
  // C2b-1: Pflichtdok-Slots jetzt auch auf dem Kern-direkten Weg (j02-IST-Delta #2 geschlossen).
  const { count: cPflichtdok } = cClaim?.id
    ? await db.from('pflichtdokumente').select('id', { count: 'exact', head: true }).eq('fall_id', cClaim.id)
    : { count: 0 }
  check('C pflichtdokumente >= 1 (Kern-Garantie, C2b-1)', (cPflichtdok ?? 0) >= 1, `count=${cPflichtdok}`)

  const passed = results.filter((r) => r.ok).length
  log(`\n  === ${passed}/${results.length} Assertions gruen ===\n`)
  if (passed < results.length) process.exitCode = 1
}

// ---------------------------------------------------------------- DISPATCH
async function main() {
  log(`\n== Meldung-Kanaele J2-Seed [${MODE.toUpperCase()}] gegen ${URL_} ==`)
  if (MODE === 'clean') { await clean(); log('  --clean fertig.\n'); return }
  if (MODE === 'assert') { await assertKanaele(); return }
  await clean(true) // frischer Start — NUR alte Reste (Race-Guard: fremde frische Laeufe unberuehrt)
  await seed()
}
main().catch((e) => { console.error('FEHLER:', e.message); process.exit(1) })
