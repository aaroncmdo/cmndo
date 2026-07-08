// src/lib/claims/detail/__tests__/get-claim-detail.test.ts
// Phase C: Integrations-Smoke fuer die rollen-aware getClaimDetail-Facade (Shape +
// Rollen-Scoping + null-Kontrakt). SERVICE-ROLE (RLS gebypassed) → prueft die LOADER-
// Logik (Komposition, Facade-Routing, Feld-Gating, null-Kontrakt), NICHT die RLS.
// Opt-in (RUN_PARITY=1 + service env), read-only. Sample-Claim aus v_claim_phase.
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getClaimDetail } from '../get-claim-detail'

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
    if (asAdmin && asAdmin.rolle !== 'kunde') {
      expect(asAdmin.core.id, 'ClaimFull.core.id != claimId').toBe(claimId)
    }
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

    // null-Kontrakt: staff-Gate mit nicht-existenter ID → null.
    const missing = await getClaimDetail(admin, '00000000-0000-0000-0000-000000000000', 'admin')
    expect(missing, 'nicht-existente ID -> null').toBeNull()
    // Kunde ohne viewer → null (braucht Ownership-Kontext).
    const kundeNoViewer = await getClaimDetail(admin, claimId, 'kunde')
    expect(kundeNoViewer, 'kunde ohne viewer -> null').toBeNull()

    process.stdout.write(
      `\n[claim-detail] claimId=${claimId} adminCore=ClaimFull auftraege=${asAdmin!.auftraege.length} ` +
        `mainPhase=${asAdmin!.lifecycle.mainPhase} ownerId=${ownerId ? 'yes' : 'none'} kundeCoreLoaded=${kundeCoreLoaded}\n`,
    )
  }, 90_000)
})
