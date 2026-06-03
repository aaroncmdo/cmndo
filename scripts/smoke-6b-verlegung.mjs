#!/usr/bin/env node
// AAR-939 6b — Behavior-Smoke: Self-Service-Verlegung nach embed-B-SV-No-Show.
//
// Beweist die DB-tragenden Effekte, auf die verlegeNachNoShowEmbedB sich verlaesst,
// gegen die LIVE-DB (die TS-Logik selbst deckt tsc + Review; hier die riskanten
// Live-Constraints):
//   (1) Termin-Geo lesbar (erste Stufe der Standort-Kaskade)
//   (2) Reverse-Sync-Trigger claims.sv_id -> faelle.sv_id (Kern der SV-Umhaengung)
//   (3) Re-Termin-Token-Roundtrip: faelle.re_termin_token-Write -> Page-Lookup findet
//       Fall mit Ersatz-sv_id; gutachter_termine eingelaufen_am-Reset oeffnet Consumed-Gate
//   (4) status='verlegt' akzeptiert (Completion-Marker + Idempotenz-Guard)
//   (5) embed-B-Realfall ohne jeden Geo -> manueller Fallback (graceful)
//
// Reversibel auf Testdaten (CLM-2026-00128). try/finally garantiert Restore.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const ENV = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local'
const env = readFileSync(ENV, 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})
let exit = 0
const ok = (m) => console.log(`[OK]   ${m}`)
const fail = (m) => { console.error(`[FAIL] ${m}`); exit = 1 }

const CLAIM = '0f19efb3-35d9-4bac-885a-993cb40c8f4e' // CLM-2026-00128 (nur_gutachter Testdaten)
const FALL = '0fa542a5-b323-4d98-a430-b9ce89e39453'
const ORIG_SV = '677400bf-dd31-4581-a645-07a7d624c190'
const GEO = { lat: 51.2562, lng: 7.1508 } // Wuppertal, Test-Koordinaten

// Ersatz-SV: irgendein dispatchbarer SV != ORIG_SV.
const { data: svs } = await svc
  .from('sachverstaendige')
  .select('id')
  .eq('ist_aktiv', true)
  .eq('portal_zugang_freigeschaltet', true)
  .is('gesperrt_seit', null)
  .is('geloescht_am', null)
  .neq('id', ORIG_SV)
  .limit(1)
const REPLACEMENT_SV = svs?.[0]?.id
if (!REPLACEMENT_SV) { console.error('FEHLER: kein Ersatz-SV verfuegbar'); process.exit(1) }
console.log(`Ersatz-SV: ${REPLACEMENT_SV}`)

// Orig-State sichern.
const { data: claim0 } = await svc.from('claims').select('sv_id').eq('id', CLAIM).single()
const { data: fall0 } = await svc.from('faelle').select('sv_id, re_termin_token').eq('id', FALL).single()
if (!claim0 || !fall0) { console.error('FEHLER: Testdaten CLM-2026-00128 nicht gefunden'); process.exit(1) }

let testTerminId = null
try {
  // Seed: Test-Termin MIT Geo, weit in der Zukunft (kein EXCLUSION-Konflikt fuer ORIG_SV).
  const { data: ins, error: insErr } = await svc
    .from('gutachter_termine')
    .insert({
      fall_id: FALL,
      claim_id: CLAIM,
      sv_id: ORIG_SV,
      start_zeit: '2027-01-15T10:00:00.000Z',
      end_zeit: '2027-01-15T11:00:00.000Z',
      status: 'reserviert',
      typ: 'sv_begutachtung',
      besichtigungsort_lat: GEO.lat,
      besichtigungsort_lng: GEO.lng,
    })
    .select('id')
    .single()
  if (insErr) { console.error(`FEHLER Seed: ${insErr.message}`); process.exit(1) }
  testTerminId = ins.id
  ok(`Test-Termin geseedet: ${testTerminId}`)

  // (1) Termin-Geo lesbar (Kaskaden-Stufe 1).
  const { data: t } = await svc
    .from('gutachter_termine')
    .select('besichtigungsort_lat, besichtigungsort_lng')
    .eq('id', testTerminId)
    .single()
  if (Number(t.besichtigungsort_lat) === GEO.lat) ok('(1) Termin-Geo gelesen (Standort-Kaskade Stufe 1)')
  else fail(`(1) Termin-Geo nicht gelesen: ${t.besichtigungsort_lat}`)

  // (2) Reverse-Sync: claims.sv_id := Ersatz -> faelle.sv_id synct via Trigger.
  const { error: cErr } = await svc.from('claims').update({ sv_id: REPLACEMENT_SV }).eq('id', CLAIM)
  if (cErr) fail(`(2) claims.sv_id-Update: ${cErr.message}`)
  const { data: fAfter } = await svc.from('faelle').select('sv_id').eq('id', FALL).single()
  if (fAfter.sv_id === REPLACEMENT_SV) ok('(2) Reverse-Sync claims.sv_id -> faelle.sv_id')
  else fail(`(2) faelle.sv_id nicht gesynct: erwartet ${REPLACEMENT_SV}, ist ${fAfter.sv_id}`)

  // (3) Token-Roundtrip: faelle.re_termin_token-Write + gt eingelaufen_am-Reset -> Page-Lookup.
  const token = randomUUID()
  await svc.from('faelle').update({ re_termin_token: token }).eq('id', FALL)
  await svc
    .from('gutachter_termine')
    .update({ re_termin_token: token, re_termin_token_eingelaufen_am: null })
    .eq('id', testTerminId)
  const { data: lookup } = await svc.from('faelle').select('id, sv_id').eq('re_termin_token', token).single()
  if (lookup?.id === FALL && lookup.sv_id === REPLACEMENT_SV) {
    ok('(3) Page-Lookup findet Fall via re_termin_token mit Ersatz-sv_id')
  } else fail(`(3) Page-Lookup falsch: ${JSON.stringify(lookup)}`)
  const { data: gtTok } = await svc
    .from('gutachter_termine')
    .select('re_termin_token_eingelaufen_am')
    .eq('id', testTerminId)
    .single()
  if (gtTok.re_termin_token_eingelaufen_am === null) ok('(3) eingelaufen_am=null -> Consumed-Gate offen fuer Kunde')
  else fail('(3) eingelaufen_am nicht zurueckgesetzt')

  // (4) status='verlegt' + Idempotenz-Semantik.
  await svc.from('gutachter_termine').update({ status: 'verlegt' }).eq('id', testTerminId).neq('status', 'verlegt')
  const { data: gtSt } = await svc.from('gutachter_termine').select('status').eq('id', testTerminId).single()
  if (gtSt.status === 'verlegt') ok('(4) status=verlegt gesetzt (Idempotenz-Guard greift bei Replay)')
  else fail(`(4) status nicht verlegt: ${gtSt.status}`)

  // (5) manueller Fallback: CLM-2026-00128 hat keinen claims/faelle-Geo -> ohne Termin-Geo => manuell.
  const { data: cGeo } = await svc.from('claims').select('schadenort_lat').eq('id', CLAIM).single()
  const { data: fGeo } = await svc.from('faelle').select('besichtigungsort_lat').eq('id', FALL).single()
  if (cGeo.schadenort_lat == null && fGeo.besichtigungsort_lat == null) {
    ok('(5) embed-B ohne claims/faelle-Geo bestaetigt -> ohne Termin-Geo => manueller Fallback')
  } else fail(`(5) unerwarteter Geo: claims=${cGeo.schadenort_lat} faelle=${fGeo.besichtigungsort_lat}`)
} finally {
  // Restore: claims.sv_id zurueck (synct faelle.sv_id), Token zuruecksetzen, Test-Termin loeschen.
  await svc.from('claims').update({ sv_id: claim0.sv_id }).eq('id', CLAIM)
  await svc.from('faelle').update({ re_termin_token: fall0.re_termin_token ?? null }).eq('id', FALL)
  if (testTerminId) await svc.from('gutachter_termine').delete().eq('id', testTerminId)
  const { data: fR } = await svc.from('faelle').select('sv_id, re_termin_token').eq('id', FALL).single()
  if (fR && fR.sv_id === claim0.sv_id) console.log('[OK]   Restore: claims/faelle.sv_id zurueckgesetzt')
  else console.error(`[FAIL] Restore sv_id inkonsistent: ${fR?.sv_id} != ${claim0.sv_id}`)
}

console.log(exit === 0 ? '\nSMOKE GRUEN' : '\nSMOKE ROT')
process.exit(exit)
