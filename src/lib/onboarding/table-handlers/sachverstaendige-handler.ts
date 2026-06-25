import { createAdminClient } from '@/lib/supabase/admin'
import { SV_WHITELIST } from '@/lib/sv-onboarding/whitelist'
import { resolveSvBasic } from '../resolve-sv-basic'
import { buildAllowlistedUpdates, type OnboardingTableHandler } from './types'

// CMM-49: SV-Onboarding-Fakten auf sachverstaendige (whitelist-gated, kein coerce — 1:1 aus
// speichereSvOnboardingStep/filterAufWhitelist). Mass-Assignment-Guard via SV_WHITELIST (NIE
// paket/verifiziert/verifizierung_status/ist_aktiv/portal_zugang_freigeschaltet/onboarding_status/
// rolle). Ownership = SV-Basic-Gate (profile_id==user + paket='basic').
export const sachverstaendigeHandler: OnboardingTableHandler = {
  tabelle: 'sachverstaendige',
  async apply(ctx, felder, values) {
    const gate = await resolveSvBasic(ctx)
    if (!gate.ok) return gate
    const updates = buildAllowlistedUpdates(felder, values, SV_WHITELIST, (_s, v) => v, 'sachverstaendige')
    if (Object.keys(updates).length === 0) return { ok: true, id: gate.svId }
    const admin = createAdminClient()
    const { error } = await admin.from('sachverstaendige').update(updates).eq('id', gate.svId)
    if (error) {
      console.error('[sv-onboarding] sv update:', error.message)
      return { ok: false, error: 'Speichern fehlgeschlagen.' }
    }
    return { ok: true, id: gate.svId }
  },
}
