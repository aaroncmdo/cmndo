// CMM Entity Writer-Wiring (Plan 3 #2483) — INTEGRATIONSTEST (echte DB).
//
// Beweist die T2-T4-Verdrahtung gegen das echte Schema: ein Gewerbe-Lead mit
// Gegner-Kennzeichen + Schadenbeschreibung wird via convertLeadToClaim zu
// Entitaeten verdrahtet (statt flach):
//   T2  claim_parties[geschaedigter].firma_id      <- ensureFirma (firmen-Entitaet)
//   T3  claim_vehicle_involvements rolle='verursacher' <- ensureVehicleFromKennzeichen
//   T4  vehicle_vorschaeden state='aktuell'        <- recordVehicleDamage
//   T5  claims.vehicle_id + vehicles-Row (FIN/Kennzeichen/Hersteller/Modell) <- ensureVehicleFromFin
//       == Verifikations-Gate fuer den faelle-Vehicle-Col-Write-Retire (#2830): beweist, dass die
//       Fahrzeugdaten in der vehicles-SSoT landen (nicht nur in faelle) -> Retire ist data-lossless.
//   T6  claim_parties[geschaedigter].adresse_strasse <- lead.kunde_strasse  (+ person_id)
//       == Gate fuer den Conversion-Clean Group B (faelle.kunde_*-INSERT-Retire): die Kunde-Identitaet/
//       -Anschrift landet auf der Geschaedigter-Partei.
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
import { randomUUID } from 'node:crypto'
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
  const geschKz = `ZZ-GS ${ts % 100000}` // T5: Geschaedigten-Fahrzeug-Kennzeichen (distinkt vom Gegner)
  const schadenText = `${tag} Front links` // distinktiver claims-Fingerprint (Race-Fallback-Cleanup)
  const testFin = `ZZTESTVN${ts}`.slice(0, 17) // geschaedigter-Fahrzeug — T4 braucht resolvedVehicleId via FIN
  const kundeStrasse = `${tag} Kundenstr 5` // T6 (Group B): Kunde-Anschrift -> Geschaedigter-Partei

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
        fin: testFin,
        fahrzeug_hersteller: 'Testmarke',
        fahrzeug_modell: 'Testmodell',
        kennzeichen: geschKz, // T5: Geschaedigten-Fahrzeug -> vehicles via ensureVehicleFromFin
        kunde_strasse: kundeStrasse, // T6: Kunde-Anschrift -> Geschaedigter-Partei
        kunde_plz: '50667',
        kunde_stadt: 'Koeln',
        gegner_bekannt: true,
        gegner_kennzeichen: gegnerKz,
        gegner_fahrzeugtyp: 'pkw', // faelle CHECK check_gegner_fahrzeugtyp: lowercase-Enum

        fahrzeugschaden_beschreibung: schadenText,
        status: 'neu',
      })
      .select('id')
      .single()
    if (error) throw new Error(`lead insert: ${error.message}`)
    leadId = lead!.id as string
  })

  const purgeClaim = async (cid: string) => {
    await db.from('vehicle_vorschaeden').delete().eq('claim_id', cid)
    await db.from('claim_vehicle_involvements').delete().eq('claim_id', cid)
    await db.from('claim_parties').delete().eq('claim_id', cid)
    await db.from('faelle').delete().eq('claim_id', cid)
    await db.from('claims').delete().eq('id', cid)
  }

  afterAll(async () => {
    // 1) Primaer: per erfasste ID (sauberer Pfad).
    if (claimId) await purgeClaim(claimId)
    // 2) Race-Fallback: falls ein Timeout die ID-Erfassung verhindert hat (Converter
    //    laeuft im Hintergrund weiter), Orphan-Claim ueber den Schaden-Fingerprint
    //    nachraeumen — nie Orphan-Daten in der prod+staging-geteilten DB hinterlassen.
    const { data: orphans } = await db.from('claims').select('id').eq('fahrzeugschaden_beschreibung', schadenText)
    for (const c of orphans ?? []) await purgeClaim(c.id as string)
    // 3) Globale Entitaeten + Lead (cascaden NICHT mit dem Claim) per ID + Tag-Fallback.
    if (leadId) await db.from('leads').delete().eq('id', leadId)
    await db.from('personen').delete().ilike('nachname', `${tag}%`)
    await db.from('firmen').delete().ilike('name', `${tag}%`)
    if (gegnerVehicleId) await db.from('vehicles').delete().eq('id', gegnerVehicleId)
    await db.from('vehicles').delete().eq('kennzeichen_aktuell', gegnerKz)
    await db.from('vehicles').delete().eq('fin', testFin)
    await db.from('vehicles').delete().eq('kennzeichen_aktuell', geschKz) // T5: Geschaedigten-Vehicle (Beleg+Suspenders)
  })

  it('Gewerbe-Lead -> Firma + Geschaedigter-Vehicle (vehicles-SSoT/#2830) + Kunde-Adresse-Partei + Gegner-Involvement + Schaden', async () => {
    const res = await convertLeadToClaim({ leadId: leadId! })
    if (!res.ok) console.error('convertLeadToClaim fehlgeschlagen:', res.error)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    claimId = res.claimId

    // T2: Geschaedigter-Partei traegt firma_id (firmen-Entitaet via ensureFirma)
    const { data: gp } = await db
      .from('claim_parties')
      .select('firma_id, vehicle_id, person_id, personen!claim_parties_person_id_fkey(adresse_strasse)')
      .eq('claim_id', claimId)
      .eq('rolle', 'geschaedigter')
      .single()
    expect(gp?.firma_id).toBeTruthy()
    firmaId = (gp!.firma_id as string | null) ?? null

    // T6 (CMM-49 Plan-5): die Kunde-Anschrift liegt jetzt in der personen-Entitaet (via person_id),
    // nicht mehr flach auf claim_parties (flat-Spalten gedroppt) — Person via ensurePersonForData.
    // Damit ist der faelle.kunde_*-INSERT-Retire data-lossless.
    const gpPerson = (Array.isArray(gp?.personen) ? gp?.personen[0] : gp?.personen) as { adresse_strasse?: string | null } | null | undefined
    expect(gpPerson?.adresse_strasse).toBe(kundeStrasse)
    expect(gp?.person_id).toBeTruthy()

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

    // T5 (#2830-Gate): Geschaedigten-Fahrzeug in der vehicles-SSoT + am Claim verlinkt.
    // claims.vehicle_id == claim_parties[geschaedigter].vehicle_id; die vehicles-Row traegt
    // die Lead-Fahrzeugdaten (FIN/Kennzeichen/Hersteller/Modell). Beweist: der faelle-Vehicle-
    // Col-Write-Retire (#2830) verliert keine Daten.
    const { data: claimRow } = await db
      .from('claims')
      .select('vehicle_id')
      .eq('id', claimId)
      .single()
    expect(claimRow?.vehicle_id).toBeTruthy()
    expect(claimRow?.vehicle_id).toBe(gp?.vehicle_id)
    const { data: veh } = await db
      .from('vehicles')
      .select('fin, kennzeichen_aktuell, hersteller, modell_haupttyp')
      .eq('id', claimRow!.vehicle_id as string)
      .single()
    expect(veh?.fin).toBe(testFin)
    expect(veh?.kennzeichen_aktuell).toBe(geschKz)
    expect(veh?.hersteller).toBe('Testmarke')
    expect(veh?.modell_haupttyp).toBe('Testmodell')

    // CMM-49 D2 (claim-first Genesis): convertLeadToClaim legt KEINE faelle-Row mehr an.
    // fall_id == claim_id; die faelle_claim_bridge (via trg_sync_claims_to_bridge) ist der
    // fall_id->claim_id-Lookup fuer die fall_id-Kinder. Gate fuer den Genesis-INSERT-Cutover.
    const { count: faelleCount } = await db
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .eq('claim_id', claimId)
    expect(faelleCount).toBe(0)
    const { data: bridge } = await db
      .from('faelle_claim_bridge')
      .select('fall_id, claim_id')
      .eq('claim_id', claimId)
      .single()
    expect(bridge?.fall_id).toBe(claimId)
    expect(res.fallId).toBe(claimId)
  }, 30_000) // Remote-Converter macht viele sequentielle Round-Trips (~7s) -> Default-5s reicht nicht
})

// CMM-Entity Follow-up (C) — Halter-Party-Integrationstest (Kunde != Halter).
d('convert-lead-to-claim Halter-Party (Kunde != Halter, DB-Integration)', () => {
  let db2: SupabaseClient
  const ts2 = Date.now()
  const tag2 = `ZZ_HALTER_${ts2}`
  const schadenText2 = `${tag2} Heck rechts`
  let leadId2: string | null = null
  let claimId2: string | null = null

  beforeAll(async () => {
    db2 = createClient(URL!, KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: lead, error } = await db2
      .from('leads')
      .insert({
        vorname: 'KundeFahrer',
        nachname: tag2,
        ist_fahrzeughalter: false, // Kunde != Halter -> separate halter-Party erwartet
        halter_vorname: 'Eigentuemer',
        halter_nachname: `${tag2} Leasing`,
        halter_strasse: 'Halterweg 1',
        halter_plz: '50670',
        halter_stadt: 'Koeln',
        halter_geburtsdatum: '1980-05-15', // CMM-50 Group C: vcf.halter_geburtsdatum aus personen-Snapshot
        gegner_bekannt: false,
        fahrzeugschaden_beschreibung: schadenText2,
        status: 'neu',
      })
      .select('id')
      .single()
    if (error) throw new Error(`lead insert: ${error.message}`)
    leadId2 = lead!.id as string
  })

  const purge2 = async (cid: string) => {
    await db2.from('vehicle_vorschaeden').delete().eq('claim_id', cid)
    await db2.from('claim_vehicle_involvements').delete().eq('claim_id', cid)
    await db2.from('claim_parties').delete().eq('claim_id', cid)
    await db2.from('faelle').delete().eq('claim_id', cid)
    await db2.from('claims').delete().eq('id', cid)
  }

  afterAll(async () => {
    if (claimId2) await purge2(claimId2)
    const { data: orphans } = await db2.from('claims').select('id').eq('fahrzeugschaden_beschreibung', schadenText2)
    for (const o of orphans ?? []) await purge2(o.id as string)
    if (leadId2) await db2.from('leads').delete().eq('id', leadId2)
    await db2.from('personen').delete().ilike('nachname', `${tag2}%`)
  })

  it('Kunde != Halter -> separate halter-Party (rolle=halter, ist_halter=true) mit Person; Geschaedigter ist_halter=false', async () => {
    const res = await convertLeadToClaim({ leadId: leadId2! })
    if (!res.ok) console.error('convertLeadToClaim (halter) fehlgeschlagen:', res.error)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    claimId2 = res.claimId

    // Fix C: separate halter-Party aus lead.halter_* (rolle='halter', ist_halter=true, mit Person)
    const { data: halter } = await db2
      .from('claim_parties')
      .select('ist_halter, person_id, personen!claim_parties_person_id_fkey(nachname)')
      .eq('claim_id', claimId2)
      .eq('rolle', 'halter')
      .single()
    expect(halter?.ist_halter).toBe(true)
    // CMM-49 Plan-5: Halter-Name in personen (via person_id), nicht mehr flach auf claim_parties.
    const halterPerson = (Array.isArray(halter?.personen) ? halter?.personen[0] : halter?.personen) as { nachname?: string | null } | null | undefined
    expect(halterPerson?.nachname as string | null).toContain(tag2)
    expect(halter?.person_id).toBeTruthy() // ensurePersonForData: Halter hat Namen -> Person

    // CMM-50 Group C: v_claim_full.halter_* sourct aus der halter-Party-PERSON (halter_p LATERAL).
    // Beweist, dass die Konvertierung den Halter VOLLSTAENDIG ins Entity-Modell schreibt (inkl.
    // geburtsdatum, die zuvor fehlende Snapshot-Luecke) → der faelle.halter_*-Write-Retire ist
    // data-lossless (vcf zeigt den Halter aus personen, nicht aus faelle).
    const { data: vcfHalter } = await db2
      .from('v_claim_full')
      .select('halter_nachname, halter_geburtsdatum, halter_strasse')
      .eq('id', claimId2)
      .single()
    expect(vcfHalter?.halter_nachname as string | null).toContain(tag2)
    expect(vcfHalter?.halter_geburtsdatum).toBe('1980-05-15')
    expect(vcfHalter?.halter_strasse).toBe('Halterweg 1')

    // Geschaedigter-Party ist NICHT Halter (ist_fahrzeughalter=false)
    const { data: gesch } = await db2
      .from('claim_parties')
      .select('ist_halter')
      .eq('claim_id', claimId2)
      .eq('rolle', 'geschaedigter')
      .single()
    expect(gesch?.ist_halter).toBe(false)
  }, 30_000)
})

// CMM-49 D2-Teil-2: createClaimForFall claim-first (admin/faelle/anlegen-Pfad).
// Beweist: createClaimForFall mit frischem fallId (KEINE faelle-Row vorhanden) legt den Claim
// mit id==fallId an, die Bridge entsteht via trg_sync_claims_to_bridge, der faelle.update-Backref
// no-oppt mangels Row -> der admin-Genesis ist faelle-frei.
d('createClaimForFall claim-first (D2-Teil-2, DB-Integration)', () => {
  let db3: SupabaseClient
  let fallId3: string | null = null

  beforeAll(() => {
    db3 = createClient(URL!, KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  })

  afterAll(async () => {
    if (fallId3) {
      await db3.from('faelle_claim_bridge').delete().eq('claim_id', fallId3)
      await db3.from('claims').delete().eq('id', fallId3)
    }
  })

  it('frischer fallId -> Claim id==fallId + Bridge, KEINE faelle-Row', async () => {
    const { createClaimForFall } = await import('../../claims/create-for-fall')
    fallId3 = randomUUID()
    const claimId = await createClaimForFall(db3, fallId3, {
      schadens_plz: '50667',
      schadens_art: 'haftpflicht',
    }, 'manuell_admin')
    expect(claimId).toBe(fallId3) // Identity: claim.id == fallId
    const { count: fc } = await db3
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .eq('id', fallId3)
    expect(fc).toBe(0)
    const { data: br } = await db3
      .from('faelle_claim_bridge')
      .select('fall_id, claim_id')
      .eq('claim_id', fallId3)
      .single()
    expect(br?.fall_id).toBe(fallId3)
  }, 20_000)
})
