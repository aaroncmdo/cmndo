import { createAdminClient } from '@/lib/supabase/admin'
import { buildVerursacherPartyUpdates } from '@/lib/onboarding/verursacher-party-facts'
import { resolveOwnedClaimId } from '../resolve-owned-claim'
import { findVerursacherParty, insertVerursacherParty } from '@/lib/claims/verursacher-party'
import type { OnboardingTableHandler } from './types'

// CMM-49 Increment 3: Gegner-Fakten aus dem kunde-onboarding -> verursacher-claim_party (SSoT).
// v_claim_full liest die Gegner-Felder von der Party (gp-LATERAL: kennzeichen / versicherung_klartext
// / versicherungsnummer). Selektion == v_claim_full.gp (rolle='verursacher', reihenfolge, created_at);
// existiert keine verursacher-Party (meist, 1/84) -> on-demand anlegen (Option A, quelle='kunde_self'
// per claim_parties_quelle_check). Ownership-gated wie der claims-Handler.
export const claimPartiesHandler: OnboardingTableHandler = {
  tabelle: 'claim_parties',
  async apply(ctx, felder, values) {
    const gate = await resolveOwnedClaimId(ctx)
    if (!gate.ok) return gate
    const { claimId } = gate

    const updates = buildVerursacherPartyUpdates(felder, values)
    if (Object.keys(updates).length === 0) return { ok: true, id: claimId }

    const admin = createAdminClient()
    const found = await findVerursacherParty(admin, claimId)
    if (!found.ok) return { ok: false, error: found.error }

    if (found.party) {
      const { error: upErr } = await admin.from('claim_parties').update(updates).eq('id', found.party.id)
      if (upErr) return { ok: false, error: upErr.message }
      return { ok: true, id: claimId }
    }

    // Keine verursacher-Party: nur anlegen wenn mind. ein echter Wert kommt (kein leeres Insert).
    const hasValue = Object.values(updates).some((v) => v != null)
    if (hasValue) {
      const ins = await insertVerursacherParty(admin, claimId, 'kunde_self', updates)
      if (!ins.ok) return { ok: false, error: ins.error }
    }
    return { ok: true, id: claimId }
  },
}
