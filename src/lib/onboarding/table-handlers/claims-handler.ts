import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOwnedClaimId } from '../resolve-owned-claim'
import { buildAllowlistedUpdates, type OnboardingTableHandler } from './types'

// CMM-49: schreibbare claim-Fakten aus dem kunde-onboarding (Defense-in-Depth ZUSAETZLICH zur
// onboarding_felder-Config). Deckt die kunde-onboarding-claims-Targets ab (DB-verifiziert):
// hergang_kunde_text, kanzlei_wunsch, hat_personenschaden/-sachschaden, sachschaden_beschreibung,
// polizei_vor_ort/-aktenzeichen, zeugen_vorhanden/-kontakte, service_typ (WP-D). schadenart/
// spezifikation bleiben (andere Flows/zukuenftig) — nur geschrieben wenn ein Feld sie zielt.
// kanzlei_wunsch ergaenzt (war in der alten Allowlist NICHT -> still verschluckt; Loss-Fix).
const CLAIMS_ONBOARDING_WRITABLE = new Set<string>([
  'hergang_kunde_text', 'schadenart', 'spezifikation',
  'hat_personenschaden', 'hat_sachschaden', 'sachschaden_beschreibung',
  'polizei_vor_ort', 'polizei_aktenzeichen',
  'zeugen_vorhanden', 'zeugen_kontakte',
  'service_typ', 'kanzlei_wunsch',
])
// Bool-Subset: segmented/toggle liefert String -> hier in echtes boolean coercen (per Spalte,
// nicht per typ — 1:1 aus dem alten saveClaimsOnboardingFacts uebernommen).
const CLAIMS_ONBOARDING_BOOL = new Set<string>([
  'hat_personenschaden', 'hat_sachschaden', 'polizei_vor_ort', 'zeugen_vorhanden',
])

function coerceClaim(spalte: string, val: unknown): unknown {
  if (CLAIMS_ONBOARDING_BOOL.has(spalte)) return val === true || val === 'true' || val === 'ja' || val === '1'
  if (typeof val === 'string' && val.trim() === '') return null
  return val
}

// kunde-onboarding-Fakten -> der EXISTIERENDE Claim (ownership-gated, NICHT eine gfa). Admin-Write
// NACH bestandenem resolveOwnedClaimId-Gate (geschaedigter == user).
export const claimsHandler: OnboardingTableHandler = {
  tabelle: 'claims',
  async apply(ctx, felder, values) {
    const gate = await resolveOwnedClaimId(ctx)
    if (!gate.ok) return gate
    const { claimId } = gate
    const updates = buildAllowlistedUpdates(felder, values, CLAIMS_ONBOARDING_WRITABLE, coerceClaim, 'claims')
    if (Object.keys(updates).length === 0) return { ok: true, id: claimId }
    const admin = createAdminClient()
    const { error } = await admin.from('claims').update(updates).eq('id', claimId)
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: claimId }
  },
}
