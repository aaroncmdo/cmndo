// CMM Entity Writer-Wiring (Plan 3 #2483) — INTEGRATIONSTEST (echte DB).
//
// Beweist die T2-T4-Verdrahtung gegen das echte Schema: ein Gewerbe-Lead mit
// Gegner-Kennzeichen + Schadenbeschreibung wird via convertLeadToClaim zu
// Entitaeten verdrahtet (statt flach):
//   T2  claim_parties[geschaedigter].firma_id      <- ensureFirma (firmen-Entitaet)
//   T3  claim_vehicle_involvements rolle='verursacher' <- ensureVehicleFromKennzeichen
//   T4  vehicle_vorschaeden state='aktuell'        <- recordVehicleDamage
//
// GEGATET: laeuft NUR mit RUN_DB_INTEGRATION=1 + Service-Creds in der Env —
// sonst describe.skip (normaler `vitest run` / CI ueberspringt es). Manuell:
//   set -a; source <main>/.env.local; set +a; RUN_DB_INTEGRATION=1 npx vitest run \
//     src/lib/leads/__tests__/convert-entity-wiring.integration.test.ts
//
// ACHTUNG: schreibt einen ECHTEN Claim — die DB ist prod+staging geteilt
// (paizkjajbuxxksdoycev). Voll self-cleaning im afterAll: loescht Schaden ->
// Involvements -> Parties -> faelle-Bridge -> Claim -> Lead UND die global
// angelegten firmen/vehicles-Entitaets-Rows (cascaden NICHT mit dem Claim).
// Alle Fixtures sind ZZ_-getaggt fuer eindeutige Identifizierung.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { convertLeadToClaim } from '../convert-lead-to-claim'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RUN = process.env.RUN_DB_INTEGRATION === '1' && !!URL && !!KEY

const d = RUN ? describe : describe.skip

d('convert-lead-to-claim Entity-Wiring (DB-Integration)', () => {
  let db: SupabaseClient
  const ts = Date.now()
  const tag = `ZZ_ENTITY_WIRING_${ts}`
  const firmaName = `${tag} GmbH`
  const gegnerKz = `ZZ-EW ${ts % 100000}`

  let leadId: string | null = null
  let claimId: string | null = null
  let firmaId: string | null = null
  let gegnerVehicleId: string | null = null

  beforeAll(async () => {
    db = createClient(URL!, KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: lead, error } = await db
      .from('leads')
      .insert({
        vorname: 'Integ',
        nachname: tag,
        email: `${tag.toLowerCase()}@entity-wiring-test.invalid`,
        gewerbe_flag: true,
        firma_name: firmaName,
        gegner_bekannt: true,
        gegner_kennzeichen: gegnerKz,
        gegner_fahrzeugtyp: 'PKW',
        fahrzeugschaden_beschreibung: 'Integrationstest Front links',
        status: 'neu',
      })
      .select('id')
      .single()
    if (error) throw new Error(`lead insert: ${error.message}`)
    leadId = lead!.id as string
  })

  afterAll(async () => {
    // Reihenfolge: claim-gebundene Kinder zuerst, dann Claim + Lead, zuletzt die
    // globalen Entitaeten (firmen/vehicles loeschen sich NICHT per Claim-Cascade).
    if (claimId) {
      await db.from('vehicle_vorschaeden').delete().eq('claim_id', claimId)
      await db.from('claim_vehicle_involvements').delete().eq('claim_id', claimId)
      await db.from('claim_parties').delete().eq('claim_id', claimId)
      await db.from('faelle').delete().eq('claim_id', claimId)
      await db.from('claims').delete().eq('id', claimId)
    }
    if (leadId) await db.from('leads').delete().eq('id', leadId)
    if (gegnerVehicleId) await db.from('vehicles').delete().eq('id', gegnerVehicleId)
    if (firmaId) await db.from('firmen').delete().eq('id', firmaId)
  })

  it('Gewerbe-Lead -> Geschaedigter-Firma + Gegner-Vehicle-Involvement + aktueller Schaden', async () => {
    const res = await convertLeadToClaim({ leadId: leadId! })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    claimId = res.claimId

    // T2: Geschaedigter-Partei traegt firma_id (firmen-Entitaet via ensureFirma)
    const { data: gp } = await db
      .from('claim_parties')
      .select('firma_id')
      .eq('claim_id', claimId)
      .eq('rolle', 'geschaedigter')
      .single()
    expect(gp?.firma_id).toBeTruthy()
    firmaId = (gp!.firma_id as string | null) ?? null

    // T3: genau ein Gegner-Fahrzeug-Involvement mit rolle='verursacher'
    const { data: inv } = await db
      .from('claim_vehicle_involvements')
      .select('vehicle_id, rolle')
      .eq('claim_id', claimId)
      .eq('rolle', 'verursacher')
    expect((inv ?? []).length).toBe(1)
    gegnerVehicleId = (inv?.[0]?.vehicle_id as string | undefined) ?? null
    expect(gegnerVehicleId).toBeTruthy()

    // T4: genau ein aktueller Schaden (state='aktuell') fuer diesen Claim
    const { count } = await db
      .from('vehicle_vorschaeden')
      .select('id', { count: 'exact', head: true })
      .eq('claim_id', claimId)
      .eq('state', 'aktuell')
    expect(count).toBe(1)
  })
})
