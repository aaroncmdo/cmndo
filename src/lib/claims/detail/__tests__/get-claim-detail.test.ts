// src/lib/claims/detail/__tests__/get-claim-detail.test.ts
// Phase C Task 1: Integrations-Smoke fuer getClaimDetail (Shape + App-Layer-Rollen-
// Scoping + null-on-no-access). Laeuft mit SERVICE-ROLE (RLS gebypassed) -> prueft
// die LOADER-Logik (Komposition, Feld-Gating, null-Kontrakt), NICHT die RLS (das ist
// Supabase + separate Gate-Audits). Opt-in (RUN_PARITY=1 + service env), read-only.
// Sample-Claim aus v_claim_phase (faelle gedroppt -> claim_id direkt in den Loader).
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getClaimDetail } from '../get-claim-detail'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RUN = !!process.env.RUN_PARITY && !!URL && !!SERVICE

describe.skipIf(!RUN)('getClaimDetail (shape + role-scoping + null-on-no-access)', () => {
  it('komponiert ein rollen-gescopetes Bundle + haelt den null-Kontrakt', async () => {
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

    // Admin-Sicht: voller Kern + Sub-Entities exponiert.
    const asAdmin = await getClaimDetail(admin, claimId, 'admin')
    expect(asAdmin, 'admin bekam null').not.toBeNull()
    expect(asAdmin!.claim.id).toBe(claimId)
    expect(asAdmin!.rolle).toBe('admin')
    expect(Array.isArray(asAdmin!.auftraege)).toBe(true)
    expect(Array.isArray(asAdmin!.pflichtDokumente)).toBe(true)
    expect(asAdmin!.lifecycle.mainPhase, 'keine Phase abgeleitet').toBeTruthy()

    // Kunde-Sicht: App-Layer-Gating -> auftraege []/kanzleiFall null (no-leak-Default).
    const asKunde = await getClaimDetail(admin, claimId, 'kunde')
    expect(asKunde, 'kunde bekam null').not.toBeNull()
    expect(asKunde!.auftraege, 'kunde darf keine auftraege-Rohzeilen sehen').toEqual([])
    expect(asKunde!.kanzleiFall, 'kunde darf keinen kanzleiFall sehen').toBeNull()

    // Nicht-existente ID -> null (Gate-Kontrakt).
    const missing = await getClaimDetail(
      admin,
      '00000000-0000-0000-0000-000000000000',
      'admin',
    )
    expect(missing, 'nicht-existente ID muss null liefern').toBeNull()

    process.stdout.write(
      `\n[claim-detail] claimId=${claimId} adminAuftraege=${asAdmin!.auftraege.length} ` +
        `kundeAuftraege=${asKunde!.auftraege.length} mainPhase=${asAdmin!.lifecycle.mainPhase} ` +
        `subPhase=${asAdmin!.lifecycle.subPhase} pflicht=${asAdmin!.pflichtDokumente.length}\n`,
    )
  }, 60_000)
})
