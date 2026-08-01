// P6 / K8-Backfill: vehicles.current_owner_id aus den Claims ableiten.
//
// Fuer jedes owner-lose Fahrzeug (current_owner_id IS NULL) wird der juengste Claim
// mit vehicle_id=veh.id gesucht und der Owner-Kandidat in dieser Kaskade aufgeloest:
//   1) claims.geschaedigter_user_id   (CMM-19-gepflegt, direktester Kandidat)
//   2) claim_parties(geschaedigter).user_id
//   3) faelle.kunde_id                (Alt-Daten-Fallback; Spiegel-Write ist seit CMM-49
//                                      entfernt, Alt-Faelle tragen ihn noch)
// Sanity-Gate: der Kandidat muss profiles.rolle='kunde' sein (nie SV/Admin binden).
// Flotten-Achse ausgeschlossen: Fahrzeuge mit flotten_fahrzeuge-Eintrag werden NIE
// an einen Privat-Owner gebunden (K8 owner-scoped != firma-scoped).
//
// Idempotent + Re-Run-sicher: schreibt NUR wo current_owner_id IS NULL (Guard im Update).
//
// Nutzung (node >= 18, aus dem Repo-Root):
//   node scripts/backfill/vehicle-owner-from-claims.mjs           # DRY (Default): Vorschau
//   node scripts/backfill/vehicle-owner-from-claims.mjs --apply   # schreibt current_owner_id

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ENV_CANDIDATES = [
  fileURLToPath(new URL('../../.env.local', import.meta.url)),
  'C:\\Users\\Aaron Sprafke\\stampit-app\\stampit-app\\claimondo-v2\\.env.local',
]
let envRaw = null
for (const p of ENV_CANDIDATES) {
  try { envRaw = readFileSync(p, 'utf8'); break } catch { /* next */ }
}
if (!envRaw) throw new Error('.env.local nicht gefunden')
const env = {}
for (const line of envRaw.split('\n')) {
  const l = line.replace(/\r$/, '')
  if (!l.includes('=') || l.trimStart().startsWith('#')) continue
  const i = l.indexOf('=')
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const APPLY = process.argv.includes('--apply')

console.log(`[vehicle-owner-backfill] Ziel: ${URL_} — Modus: ${APPLY ? 'APPLY (schreibt!)' : 'DRY (Vorschau)'}`)

// 1) Owner-lose Fahrzeuge
const { data: vehsRaw, error: vehErr } = await db
  .from('vehicles')
  .select('id, kennzeichen_aktuell, fin')
  .is('current_owner_id', null)
if (vehErr) throw new Error('vehicles query: ' + vehErr.message)
const vehs = vehsRaw ?? []

// 2) Flotten-Fahrzeuge ausschliessen (firma-Achse)
const { data: ffRaw, error: ffErr } = await db.from('flotten_fahrzeuge').select('vehicle_id')
if (ffErr) throw new Error('flotten_fahrzeuge query: ' + ffErr.message)
const flottenVehIds = new Set((ffRaw ?? []).map((r) => r.vehicle_id))
const kandidatVehs = vehs.filter((v) => !flottenVehIds.has(v.id))
console.log(`owner-lose Fahrzeuge: ${vehs.length} — davon Flotten-Achse (uebersprungen): ${vehs.length - kandidatVehs.length}`)

// 3) Claims je Fahrzeug (juengster zuerst) — via v_claim_full (CMM-49: claims traegt
//    kein fall_id; die View bringt geschaedigter_user_id UND kunde_id in einer Row)
const vehIds = kandidatVehs.map((v) => v.id)
const CLAIM_FETCH_LIMIT = 10000
const { data: claimsRaw, error: claimsErr } = vehIds.length
  ? await db
      .from('v_claim_full')
      .select('id, vehicle_id, fall_id, geschaedigter_user_id, kunde_id, claim_nummer, created_at')
      .in('vehicle_id', vehIds)
      .order('created_at', { ascending: false })
      .limit(CLAIM_FETCH_LIMIT)
  : { data: [], error: null }
if (claimsErr) throw new Error('v_claim_full query: ' + claimsErr.message)
if ((claimsRaw ?? []).length >= CLAIM_FETCH_LIMIT) {
  console.warn(`WARNUNG: Claim-Fetch am Limit (${CLAIM_FETCH_LIMIT}) — Ergebnis evtl. unvollstaendig, Re-Run noetig.`)
}
const claimByVeh = new Map()
for (const c of claimsRaw ?? []) {
  if (!claimByVeh.has(c.vehicle_id)) claimByVeh.set(c.vehicle_id, c) // juengster gewinnt (desc-sortiert)
}

// 4) Kandidaten-Kaskade aufloesen
const zuordnungen = [] // { vehicleId, kennzeichen, ownerId, quelle, claimNummer }
const offen = [] // Fahrzeuge ohne aufloesbaren Owner
for (const veh of kandidatVehs) {
  const claim = claimByVeh.get(veh.id)
  if (!claim) { offen.push({ veh, grund: 'kein Claim' }); continue }

  let ownerId = claim.geschaedigter_user_id ?? null
  let quelle = 'claims.geschaedigter_user_id'

  if (!ownerId) {
    const { data: party } = await db
      .from('claim_parties')
      .select('user_id')
      .eq('claim_id', claim.id)
      .eq('rolle', 'geschaedigter')
      .not('user_id', 'is', null)
      .limit(1)
    ownerId = party?.[0]?.user_id ?? null
    quelle = 'claim_parties(geschaedigter)'
  }

  if (!ownerId && claim.kunde_id) {
    ownerId = claim.kunde_id
    quelle = 'v_claim_full.kunde_id (Alt-faelle-Fallback)'
  }

  if (!ownerId) { offen.push({ veh, grund: 'kein Owner-Kandidat', claim: claim.claim_nummer }); continue }
  zuordnungen.push({ vehicleId: veh.id, kennzeichen: veh.kennzeichen_aktuell, ownerId, quelle, claimNummer: claim.claim_nummer })
}

// 5) Sanity-Gate: Kandidat muss rolle='kunde' sein
const ownerIds = [...new Set(zuordnungen.map((z) => z.ownerId))]
const { data: profs, error: profErr } = ownerIds.length
  ? await db.from('profiles').select('id, rolle, vorname, nachname').in('id', ownerIds)
  : { data: [], error: null }
if (profErr) throw new Error('profiles query: ' + profErr.message)
const profById = new Map((profs ?? []).map((p) => [p.id, p]))
const final = []
for (const z of zuordnungen) {
  const p = profById.get(z.ownerId)
  if (!p) { offen.push({ veh: { id: z.vehicleId, kennzeichen_aktuell: z.kennzeichen }, grund: `Owner ${z.ownerId} ohne Profil` }); continue }
  if (p.rolle !== 'kunde') { offen.push({ veh: { id: z.vehicleId, kennzeichen_aktuell: z.kennzeichen }, grund: `Owner-Rolle '${p.rolle}' != kunde` }); continue }
  final.push({ ...z, ownerName: `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() })
}

console.log(`\nZuordnungen (${final.length}):`)
for (const z of final) {
  console.log(`  ${z.vehicleId}  ${String(z.kennzeichen ?? '—').padEnd(14)} -> ${z.ownerName} (${z.ownerId.slice(0, 8)}…)  via ${z.quelle}  [${z.claimNummer ?? '—'}]`)
}
console.log(`\nOffen/uebersprungen (${offen.length}):`)
for (const o of offen) {
  console.log(`  ${o.veh.id}  ${String(o.veh.kennzeichen_aktuell ?? '—').padEnd(14)} — ${o.grund}${o.claim ? ` [${o.claim}]` : ''}`)
}

if (!APPLY) {
  console.log('\nDRY-Lauf — nichts geschrieben. Mit --apply anwenden.')
  process.exit(0)
}

let applied = 0
for (const z of final) {
  const { error, count } = await db
    .from('vehicles')
    .update({ current_owner_id: z.ownerId }, { count: 'exact' })
    .eq('id', z.vehicleId)
    .is('current_owner_id', null) // Re-Run-/Race-Guard: nie clobbern
  if (error) { console.error(`  FEHLER ${z.vehicleId}: ${error.message}`); continue }
  applied += count ?? 0
}
console.log(`\nAPPLY fertig: ${applied}/${final.length} Fahrzeuge gebunden.`)
