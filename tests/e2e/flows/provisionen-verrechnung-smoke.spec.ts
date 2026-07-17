import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Provisions-VERRECHNUNGS-Matrix (Phase A) — beweist DB-hart, dass ausgehende Provisionen
// korrekt entstehen und NICHT doppelt gerechnet werden. Kein Browser: die Provisions-Trigger
// feuern beim claims-/bridge-INSERT (der einzige Provisions-Erzeugungs-Mechanismus im System).
// Wir inserten Test-Claims mit jeder Attribution und asserten die exakte partner_provisionen-Row.
//
// PARTNER-SICHER: nur Test-Fixtures (Test Werkstatt / test-makler bbbb2222 / Flotte-Test-Firma).
// Jeder erzeugte Claim wird getrackt und FK-sicher restlos geraeumt (afterAll). Marker fall_typ=
// 'SMOKE-PROV' fuer den Crash-Reset. Keine echten Comms (kein convert/kein Kunde-Kontakt).
//
// Opt-in (nie in CI): RUN_PROVISION_SMOKE=1 + SUPABASE_SERVICE_ROLE_KEY.

const RUN = !!process.env.RUN_PROVISION_SMOKE
test.skip(!RUN, 'set RUN_PROVISION_SMOKE=1 (laeuft echt gegen Prod-DB)')
// KEIN serial: jeder Test inserted seinen eigenen Claim -> unabhaengig; ein Fund (S6) darf
// die Doppel-Probe nicht blocken.

// ── Prod-Fixtures (17.07. verifiziert) ──
const WERKSTATT = 'aa5dd8d9-542f-4b7a-96ae-f1bd85acc9ac' // "Test Werkstatt", provision_betrag_netto 150
const MAKLER = 'bbbb2222-0000-4000-8000-000000000021' // test-makler, komplett 100 / gutachter 50
const FLOTTE_VEHICLE = '5b6a14c9-8787-4df2-ba8d-aeb8e5e4479b' // Fahrzeug in aktiver Flotte
const FLOTTE_FIRMA = 'dafc57ee-0d27-4d7e-8e1a-4a11edd6f713' // erwarteter partner_id (die Firma)
const SMOKE_TAG = 'SMOKE-PROV'

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const createdClaims = new Set<string>()

type Attribution = {
  makler_id?: string
  werkstatt_id?: string
  vermittler_typ?: string | null
  vermittler_id?: string
  vehicle_id?: string
  service_typ?: string
}

// Inserted einen minimalen Test-Claim mit der gegebenen Attribution. Die Provisions-Trigger
// feuern in derselben Transaktion (werkstatt/flotte AFTER INSERT claims; makler nach der
// auto-erzeugten faelle_claim_bridge via trg_sync_claims_to_bridge). Gibt die claim_id zurueck.
async function insertClaim(db: SupabaseClient, attr: Attribution): Promise<string> {
  const { data, error } = await db
    .from('claims')
    .insert({
      schadentag: '2026-04-15',
      schadenort_adresse: 'SMOKE-PROV Teststrasse 1',
      schadenort_plz: '10115',
      schadenort_ort: 'Berlin',
      schadenart: 'haftpflicht',
      schadens_ursache: 'unfall',
      fall_typ: SMOKE_TAG,
      operative_status: 'ersterfassung',
      ...attr,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`claim insert (${JSON.stringify(attr)}): ${error?.message}`)
  createdClaims.add(data.id as string)
  return data.id as string
}

async function provisionenFor(db: SupabaseClient, claimId: string) {
  const { data, error } = await db
    .from('partner_provisionen')
    .select('partner_typ, partner_id, betrag_netto_eur, status, trigger_event, hold_until')
    .eq('claim_id', claimId)
  if (error) throw new Error(`read provisionen ${claimId}: ${error.message}`)
  return data ?? []
}

async function setPartnerAktiv(db: SupabaseClient, tabelle: 'werkstaetten' | 'makler', id: string, aktiv: boolean) {
  const { error } = await db.from(tabelle).update({ provision_aktiv: aktiv }).eq('id', id)
  if (error) throw new Error(`set ${tabelle}.provision_aktiv=${aktiv}: ${error.message}`)
}

test.afterAll(async () => {
  const db = admin()
  const ids = [...createdClaims]
  if (ids.length) {
    // FK-sicher: erst Provisions-Kinder, dann Bridge, dann Claim. partner_staffel_bonus haengt
    // an partner_id (nicht claim) -> hier nicht erzeugt (kein Status-Flip in Phase A).
    await db.from('partner_provisionen').delete().in('claim_id', ids)
    await db.from('faelle_claim_bridge').delete().in('claim_id', ids)
    await db.from('claims').delete().in('id', ids)
  }
  // Config-Rueckbau: Test-Partner wieder aktiv (Default-Zustand).
  await setPartnerAktiv(db, 'werkstaetten', WERKSTATT, true)
  await setPartnerAktiv(db, 'makler', MAKLER, true)
  // Reste-Verify (Crash-safe: faengt auch abgestuerzte Vorlaeufe via Marker).
  const { data: rest } = await db.from('claims').select('id').eq('fall_typ', SMOKE_TAG)
  if ((rest?.length ?? 0) > 0) {
    const restIds = rest!.map((r) => r.id as string)
    await db.from('partner_provisionen').delete().in('claim_id', restIds)
    await db.from('faelle_claim_bridge').delete().in('claim_id', restIds)
    await db.from('claims').delete().in('id', restIds)
    console.warn(`[prov-smoke] ${restIds.length} SMOKE-PROV-Reste zusaetzlich geraeumt`)
  }
})

test('S1 Werkstatt-Inbound: werkstatt_id -> genau 1 Provision, 150 EUR, pending, hold+7d', async () => {
  const db = admin()
  const claimId = await insertClaim(db, { werkstatt_id: WERKSTATT, vermittler_typ: 'werkstatt', vermittler_id: WERKSTATT })
  const prov = await provisionenFor(db, claimId)
  expect(prov, 'genau 1 Provision').toHaveLength(1)
  expect(prov[0].partner_typ).toBe('werkstatt')
  expect(prov[0].partner_id).toBe(WERKSTATT)
  expect(Number(prov[0].betrag_netto_eur)).toBe(150)
  expect(prov[0].status).toBe('pending')
  expect(prov[0].hold_until, 'hold_until gesetzt (Legacy, +7d)').toBeTruthy()
})

test('S3 Makler komplett: service_typ~komplett -> 100 EUR', async () => {
  const db = admin()
  const claimId = await insertClaim(db, {
    makler_id: MAKLER, vermittler_typ: 'makler', vermittler_id: MAKLER, service_typ: 'komplett_paket',
  })
  const prov = await provisionenFor(db, claimId)
  expect(prov, 'genau 1 Provision').toHaveLength(1)
  expect(prov[0].partner_typ).toBe('makler')
  expect(prov[0].partner_id).toBe(MAKLER)
  expect(Number(prov[0].betrag_netto_eur), 'komplett -> 100').toBe(100)
})

test('S4 Makler nur_gutachter: service_typ ohne komplett -> 50 EUR (Dual-Rate)', async () => {
  const db = admin()
  const claimId = await insertClaim(db, {
    makler_id: MAKLER, vermittler_typ: 'makler', vermittler_id: MAKLER, service_typ: 'nur_gutachten',
  })
  const prov = await provisionenFor(db, claimId)
  expect(prov).toHaveLength(1)
  expect(Number(prov[0].betrag_netto_eur), 'nur_gutachter -> 50').toBe(50)
})

test('S5 Exklusivitaet: vermittler_typ=makler + beide Signale -> genau 1 (makler), kein werkstatt', async () => {
  const db = admin()
  const claimId = await insertClaim(db, {
    makler_id: MAKLER, werkstatt_id: WERKSTATT, vermittler_typ: 'makler', vermittler_id: MAKLER, service_typ: 'komplett',
  })
  const prov = await provisionenFor(db, claimId)
  expect(prov, 'Exklusivitaet: genau 1 trotz beider Signale').toHaveLength(1)
  expect(prov[0].partner_typ, 'Praezedenz makler > werkstatt').toBe('makler')
})

test('S6 Flotte: Fahrzeug in aktiver Flotte, kein makler/werkstatt -> 150 EUR an die FIRMA', async () => {
  const db = admin()
  // Regression-Pin fuer harden_provision_triggers (Mig 20260716224226): Flotte-Trigger auf
  // faelle_claim_bridge verlegt -> feuert NACH der Bridge -> kein FK-Ordering-Rollback mehr.
  const claimId = await insertClaim(db, { vehicle_id: FLOTTE_VEHICLE, vermittler_typ: 'firmen_flotte', vermittler_id: FLOTTE_FIRMA })
  const prov = await provisionenFor(db, claimId)
  expect(prov, 'genau 1 Flotten-Provision (nach Trigger-auf-bridge-Fix)').toHaveLength(1)
  expect(prov[0].partner_typ).toBe('firmen_flotte')
  expect(prov[0].partner_id, 'Empfaenger = Firma (nicht Konto)').toBe(FLOTTE_FIRMA)
  expect(Number(prov[0].betrag_netto_eur)).toBe(150)
})

test('S7a Negativ: provision_aktiv=false -> 0 Provisionen', async () => {
  const db = admin()
  await setPartnerAktiv(db, 'werkstaetten', WERKSTATT, false)
  const claimId = await insertClaim(db, { werkstatt_id: WERKSTATT, vermittler_typ: 'werkstatt', vermittler_id: WERKSTATT })
  const prov = await provisionenFor(db, claimId)
  expect(prov, 'inaktiver Partner -> keine Provision').toHaveLength(0)
  await setPartnerAktiv(db, 'werkstaetten', WERKSTATT, true)
})

test('S7b Negativ: organisch (kein Vermittler-Signal) -> 0 Provisionen', async () => {
  const db = admin()
  const claimId = await insertClaim(db, {})
  const prov = await provisionenFor(db, claimId)
  expect(prov, 'organischer Claim -> keine Provision').toHaveLength(0)
})

// ── DIE DOPPEL-FRAGE (Aaron 17.07.) ──
// Bei vermittler_typ=NULL fallen die Trigger auf die Roh-Signale zurueck. Makler- UND Werkstatt-
// Trigger feuern dann beide -> 2 Provisionen am selben Claim. Der partielle UNIQUE (partner_typ,
// claim_id) dedupliziert nur JE TYP, nicht cross-typ. Der App-Pfad (convert) setzt vermittler_typ
// immer, also praktisch unerreichbar; DB-hart aber offen (jeder Direkt-Insert/Seed/Korrektur).
// Dieser Test PINNT den IST-Zustand. Nach dem Fix (Task #8: werkstatt-Fallback AND makler_id IS
// NULL) wird die Erwartung auf 1 (makler) umgestellt = Regression-Pin.
test('DOPPEL-PROBE: vermittler_typ=NULL + makler_id + werkstatt_id -> genau 1 (makler, Praezedenz)', async () => {
  const db = admin()
  const claimId = await insertClaim(db, {
    makler_id: MAKLER, werkstatt_id: WERKSTATT, vermittler_typ: null, service_typ: 'komplett',
  })
  const prov = await provisionenFor(db, claimId)
  const typen = prov.map((p) => p.partner_typ).sort()
  console.log(`[prov-smoke] DOPPEL-PROBE (NULL-Fallback): ${prov.length} Provision(en) -> ${JSON.stringify(typen)}`)
  // Regression-Pin fuer harden_provision_triggers: werkstatt-Fallback hat jetzt den Makler-
  // Praezedenz-Guard (AND makler_id IS NULL) -> kein Cross-Typ-Doppel mehr.
  expect(prov.length, 'kein Cross-Typ-Doppel mehr (Makler-Praezedenz-Guard)').toBe(1)
  expect(typen).toEqual(['makler'])
})
