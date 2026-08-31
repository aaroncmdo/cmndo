// Wegwerf-Gutachter fuer den FLOW-Terminpfad (nicht den Finder).
//
// WARUM DIESES SCRIPT ueberhaupt existiert
// ----------------------------------------
// Der Terminschritt im Kundenfluss (/flow/[token] -> "Ihr Gutachter-Termin") war auf prod
// nie end-to-end bewiesen. Grund ist strukturell, kein Selektor-Problem: ein interner
// Bucher (@claimondo.de) bekommt ECHTE Gutachter angeboten, und der Test-SV-Guard in
// `reserviere()` sperrt die Kombination intern->echt (Matrix in src/lib/testdaten/
// test-sv-guard.ts). Jeder Smoke lief deshalb in "Diese Buchung konnte leider nicht
// abgeschlossen werden".
//
// Die Aufloesung dafuer existiert bereits: `e2e_test_fixtures` (Mig 20260812152026) —
// ein Gutachter, der fuers MATCHING echt zaehlt (ist_testaccount=false, sonst filtert
// applyDispatchableFilter ihn raus) und fuer den GUARD als Test. Damit ist die
// Konstellation intern->Test = erlaubt.
//
// ⚠ REDUNDANZ, bewusst und benannt: Die kanonische Fassung dieses Seeds ist
// `tests/e2e/lib/test-sv.ts` (seedThrowawayFinderSv / purgeThrowawayFinderSv). Sie ist
// TypeScript und laeuft nur unter Playwright; das Repo hat kein `tsx`. Der Flow-Walker
// (ep-flow.mjs) ist .mjs. Wer die Felder dort aendert, muss sie hier nachziehen —
// die Feldliste unten ist absichtlich 1:1 dieselbe.
//
// ⚠ Ein FALSCHER Eintrag in e2e_test_fixtures macht einen ECHTEN Gutachter fuer echte
// Kunden UNBUCHBAR. Deshalb laesst ein DB-Trigger (Mig 20260812154844) nur SVs mit
// E2E-Wegwerf-Profil zu. Dieses Script legt seinen SV IMMER selbst an und traegt nur
// diesen ein — nie einen vorgefundenen.
//
// Aufruf:
//   node --env-file=.env.local scripts/smoke/ep-terminpfad-sv.mjs         # anlegen
//   node --env-file=.env.local scripts/smoke/ep-terminpfad-sv.mjs --purge # abraeumen

import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { svc } from './ep-lib.mjs'

const ABLAGE = join(process.cwd(), 'scripts/smoke/.ep-terminpfad-sv.json')
const EMAIL_PREFIX = 'claimondo-e2e-finder-sv-'
const STANDORT_MARKER = 'Koeln (E2E-Wegwerf-Terminpfad-SV)'

// Domkloster 4, 50667 Koeln — dieselbe Adresse, die ep-flow.mjs als Schadenort setzt.
const KOELN = { lat: 50.9413, lng: 6.9583 }
const ISO_BOX = [
  { lat: 50.85, lng: 6.85 },
  { lat: 50.85, lng: 7.10 },
  { lat: 51.05, lng: 7.10 },
  { lat: 51.05, lng: 6.85 },
  { lat: 50.85, lng: 6.85 },
]

const db = svc()

async function purge(handle) {
  if (!handle?.svId) return
  // Reihenfolge: Termine -> Fixture (CASCADE haengt am SV) -> SV -> profile -> auth-User.
  await db.from('gutachter_termine').delete().eq('assignee_id', handle.svId)
  await db.from('e2e_test_fixtures').delete().eq('sv_id', handle.svId)
  await db.from('sachverstaendige').delete().eq('id', handle.svId)
  if (handle.uid) {
    await db.from('profiles').delete().eq('id', handle.uid)
    await db.auth.admin.deleteUser(handle.uid).catch(() => {})
  }
  console.log('abgeraeumt:', handle.svId)
}

if (process.argv.includes('--purge')) {
  let handle = null
  try { handle = JSON.parse(readFileSync(ABLAGE, 'utf8')) } catch { /* nichts zu tun */ }
  await purge(handle)
  process.exit(0)
}

const runId = String(Date.now())
const email = `${EMAIL_PREFIX}${runId}@claimondo.de`

const { data: created, error: authErr } = await db.auth.admin.createUser({
  email,
  password: `E2eTerminSv-${runId}-Xq9!`,
  email_confirm: true,
})
if (authErr || !created?.user) throw new Error(`createUser: ${authErr?.message ?? 'kein user'}`)
const uid = created.user.id

const { error: profErr } = await db
  .from('profiles')
  .upsert({ id: uid, email, rolle: 'sachverstaendiger', vorname: 'E2E-Terminpfad', nachname: 'Wegwerf' }, { onConflict: 'id' })
if (profErr) {
  await db.auth.admin.deleteUser(uid).catch(() => {})
  throw new Error(`profiles: ${profErr.message}`)
}

// Feldliste 1:1 aus tests/e2e/lib/test-sv.ts — voll dispatchable, ist_testaccount=FALSE.
const { data: sv, error: svErr } = await db
  .from('sachverstaendige')
  .insert({
    profile_id: uid,
    ist_testaccount: false,
    verifiziert: true,
    verifizierung_status: 'geprueft',
    ist_aktiv: true,
    portal_zugang_freigeschaltet: true,
    onboarding_status: 'abgeschlossen',
    gutachter_typ: 'kfz-gutachter',
    paket: 'standard',
    paket_umkreis_km: 20,
    paket_faelle_gesamt: 100,
    paket_faelle_genutzt: 0,
    offene_faelle: 0,
    ablehnungen_30_tage: 0,
    standort_lat: KOELN.lat,
    standort_lng: KOELN.lng,
    standort_adresse: STANDORT_MARKER,
    isochrone_polygon: ISO_BOX,
  })
  .select('id')
  .single()
if (svErr || !sv) {
  await db.from('profiles').delete().eq('id', uid)
  await db.auth.admin.deleteUser(uid).catch(() => {})
  throw new Error(`sachverstaendige: ${svErr?.message ?? 'kein row'}`)
}

// DIE Kennzeichnung: fuers Matching echt, fuer den Guard Test.
const { error: fixErr } = await db.from('e2e_test_fixtures').insert({ sv_id: sv.id })
if (fixErr) {
  await db.from('sachverstaendige').delete().eq('id', sv.id)
  await db.from('profiles').delete().eq('id', uid)
  await db.auth.admin.deleteUser(uid).catch(() => {})
  throw new Error(`e2e_test_fixtures: ${fixErr.message} — OHNE diesen Eintrag blockt der Guard die Buchung`)
}

const handle = { svId: sv.id, uid, email, standortMarker: STANDORT_MARKER }
writeFileSync(ABLAGE, JSON.stringify(handle, null, 2))
console.log('SV angelegt:', JSON.stringify(handle, null, 2))
console.log('-> ' + ABLAGE)
