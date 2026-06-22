import { createAdminClient } from '@/lib/supabase/admin'
import { buildVerursacherPartyUpdates } from '@/lib/onboarding/verursacher-party-facts'
import { resolveOwnedClaimId } from '../resolve-owned-claim'
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
    const { data: party, error: selErr } = await admin
      .from('claim_parties')
      .select('id')
      .eq('claim_id', claimId)
      .eq('rolle', 'verursacher')
      .order('reihenfolge', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (selErr) return { ok: false, error: selErr.message }

    const partyId = ((party as { id?: string } | null)?.id) ?? null
    if (partyId) {
      const { error: upErr } = await admin.from('claim_parties').update(updates).eq('id', partyId)
      if (upErr) return { ok: false, error: upErr.message }
      return { ok: true, id: claimId }
    }

    // Keine verursacher-Party: nur anlegen wenn mind. ein echter Wert kommt (kein leeres Insert).
    const hasValue = Object.values(updates).some((v) => v != null)
    if (hasValue) {
      const { error: insErr } = await admin
        .from('claim_parties')
        .insert({ claim_id: claimId, rolle: 'verursacher', reihenfolge: 2, quelle: 'kunde_self', ...updates })
      if (insErr) return { ok: false, error: insErr.message }
    }
    return { ok: true, id: claimId }
  },
}
