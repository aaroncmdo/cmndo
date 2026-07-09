// src/lib/claims/detail/__tests__/get-claim-detail.test.ts
// Phase C: Integrations-Smoke fuer die rollen-aware getClaimDetail-Facade (Shape +
// Rollen-Scoping + null-Kontrakt). SERVICE-ROLE (RLS gebypassed) → prueft die LOADER-
// Logik (Komposition, Facade-Routing, Feld-Gating, null-Kontrakt), NICHT die RLS.
// Opt-in (RUN_PARITY=1 + service env), read-only. Sample-Claim aus v_claim_phase.
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getClaimDetail } from '../get-claim-detail'
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RUN = !!process.env.RUN_PARITY && !!URL && !!SERVICE

describe.skipIf(!RUN)('getClaimDetail facade (role-routing + scoping + null-contract)', () => {
  it('routet Core je Rolle, gated Sub-Entities, haelt den null-Kontrakt', async () => {
    const admin = createClient(URL, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: sample } = await admin
      .from('v_claim_phase')
      .select('claim_id')
      .limit(1)
      .maybeSingle()
    const claimId = (sample?.claim_id as string) ?? ''
    expect(claimId, 'kein Sample-Claim in v_claim_phase').toBeTruthy()

    // Staff-Facade (admin, Core = ClaimFull via getClaimForRole '*').
    const asAdmin = await getClaimDetail(admin, claimId, 'admin')
    expect(asAdmin, 'admin bekam null').not.toBeNull()
    expect(asAdmin!.rolle).toBe('admin')
    // Dank Overload ist asAdmin bereits das staff-Member → core = ClaimFull (kein Narrowing noetig).
    expect(asAdmin!.core.id, 'ClaimFull.core.id != claimId').toBe(claimId)
    expect(Array.isArray(asAdmin!.auftraege)).toBe(true)
    expect(Array.isArray(asAdmin!.pflichtDokumente)).toBe(true)
    expect(asAdmin!.lifecycle.mainPhase, 'keine Phase abgeleitet').toBeTruthy()

    // Kunde-Facade (Core = getKundeFallDetailRecord); viewer aus geschaedigter_user_id.
    const { data: ownerRow } = await admin
      .from('claims')
      .select('geschaedigter_user_id')
      .eq('id', claimId)
      .maybeSingle()
    const ownerId = (ownerRow?.geschaedigter_user_id as string | null) ?? null
    let kundeCoreLoaded = false
    if (ownerId) {
      const asKunde = await getClaimDetail(admin, claimId, 'kunde', { userId: ownerId, email: null })
      if (asKunde) {
        kundeCoreLoaded = true
        expect(asKunde.rolle).toBe('kunde')
        // Sub-Entities = eigene Claim-Daten → auch der Kunde bekommt sie (die
        // Kunde-Page nutzt auftraege fuer erstgutachten/QC-Gates).
        expect(Array.isArray(asKunde.auftraege), 'kunde bekommt eigene auftraege').toBe(true)
        expect(Array.isArray(asKunde.pflichtDokumente)).toBe(true)
      }
    }

    // SV-Facade (Core = getFallForSv, flaches Record). Sample einen Claim mit sv_id,
    // svId aus sachverstaendige. Nur wenn ein SV-zugewiesener Claim existiert.
    const { data: svClaim } = await admin
      .from('claims')
      .select('id, sv_id')
      .not('sv_id', 'is', null)
      .limit(1)
      .maybeSingle()
    let svCoreLoaded = false
    if (svClaim?.sv_id) {
      const asSv = await getClaimDetail(admin, svClaim.id as string, 'sv', { svId: svClaim.sv_id as string })
      if (asSv) {
        svCoreLoaded = true
        expect(asSv.rolle).toBe('sv')
        expect(Array.isArray(asSv.auftraege), 'sv bekommt eigene auftraege').toBe(true)
        expect(Array.isArray(asSv.pflichtDokumente)).toBe(true)
      }
      // Falscher svId → null (Defense-in-Depth-Gate von getFallForSv).
      const svWrong = await getClaimDetail(admin, svClaim.id as string, 'sv', {
        svId: '00000000-0000-0000-0000-000000000000',
      })
      expect(svWrong, 'sv mit fremder svId -> null').toBeNull()
    }

    // C1-Guard (Review-Fund): getClaimDetail(kunde) MUSS pflicht per faelle.id keyen,
    // NICHT per claim_id. Referenz = die faelle.id UNABHAENGIG via Bridge aus claim_id
    // abgeleitet (nicht via core.id — das nutzt die Facade selbst → waere zirkulaer).
    // Bevorzugt einen OLD-Claim (bridge.fall_id != claim_id), wo der Bug sich zeigt:
    // dort liefert die Facade-mit-Bug pflicht-per-claim_id (idR []) != direct(faelle.id).
    let c1Checked = -1
    let c1Distinguishing = false
    const { data: bridgeData } = await admin
      .from('faelle_claim_bridge')
      .select('claim_id, fall_id')
      .limit(200)
    const bridgeRows = (bridgeData ?? []) as Array<{ claim_id: string; fall_id: string }>
    // Bevorzugt eine OLD-Zeile (claim_id != fall_id) — dort ist der Guard distinguishing;
    // sonst irgendeine Zeile (Konsistenz-Check).
    const anyRow = bridgeRows.find((r) => r.claim_id !== r.fall_id) ?? bridgeRows[0] ?? null
    if (anyRow) {
      c1Distinguishing = anyRow.claim_id !== anyRow.fall_id
      // userId aus v_claim_full.kunde_id (= was getKundeFallDetailRecord fuer die
      // Ownership-Path-1-Aufloesung prueft) → deterministisch aufloesbar.
      const { data: vcfOwner } = await admin
        .from('v_claim_full')
        .select('kunde_id')
        .eq('id', anyRow.claim_id)
        .maybeSingle()
      const oId = (vcfOwner?.kunde_id as string | null) ?? null
      if (oId) {
        const facadeDetail = await getClaimDetail(admin, anyRow.claim_id, 'kunde', { userId: oId, email: null })
        // Falls Ownership doch nicht aufloest (Daten-Edge): skippen, nicht failen —
        // der Guard prueft C1 (id-Keying), nicht Ownership.
        if (facadeDetail) {
          const directPflicht = await getPflichtdokumenteForFall(admin, anyRow.fall_id, 'kunde')
          expect(
            facadeDetail.pflichtDokumente.length,
            'C1: Facade-pflicht != direct(faelle.id) — pflicht wird per claim_id statt faelle.id gekeyt',
          ).toBe(directPflicht.length)
          c1Checked = directPflicht.length
        }
      }
    }

    // null-Kontrakt: staff-Gate mit nicht-existenter ID → null.
    const missing = await getClaimDetail(admin, '00000000-0000-0000-0000-000000000000', 'admin')
    expect(missing, 'nicht-existente ID -> null').toBeNull()
    // (kunde/sv-ohne-ctx ist jetzt ein COMPILE-Fehler dank Overload — kein Runtime-Test.)

    process.stdout.write(
      `\n[claim-detail] claimId=${claimId} adminCore=ClaimFull auftraege=${asAdmin!.auftraege.length} ` +
        `mainPhase=${asAdmin!.lifecycle.mainPhase} ownerId=${ownerId ? 'yes' : 'none'} ` +
        `kundeCoreLoaded=${kundeCoreLoaded} svCoreLoaded=${svCoreLoaded} ` +
        `c1PflichtParity=${c1Checked} c1Distinguishing=${c1Distinguishing}\n`,
    )
  }, 90_000)
})
