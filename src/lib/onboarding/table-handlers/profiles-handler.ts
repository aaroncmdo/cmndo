import { createAdminClient } from '@/lib/supabase/admin'
import { PROFILE_WHITELIST } from '@/lib/sv-onboarding/whitelist'
import { resolveSvBasic } from '../resolve-sv-basic'
import { buildAllowlistedUpdates, type OnboardingTableHandler } from './types'

// CMM-49: SV-Onboarding-Fakten auf profiles (PROFILE_WHITELIST: profilbeschreibung/anzeigename/
// telefon). avatar_url + twofa_telefon_verifiziert_am sind bewusst NICHT in der Whitelist — die
// special-typ-Felder avatar-upload/phone-verify schreiben sie ueber dedizierte Client-Flows; der
// generische Save dropt sie (1:1 wie filterAufWhitelist). Ownership = SV-Basic-Gate.
// (Nur sv-onboarding zielt auf profiles -> der SV-Gate ist hier der korrekte Owner-Check.)
export const profilesHandler: OnboardingTableHandler = {
  tabelle: 'profiles',
  async apply(ctx, felder, values) {
    const gate = await resolveSvBasic(ctx)
    if (!gate.ok) return gate
    const updates = buildAllowlistedUpdates(felder, values, PROFILE_WHITELIST, (_s, v) => v, 'profiles')
    if (Object.keys(updates).length === 0) return { ok: true, id: gate.userId }
    const admin = createAdminClient()
    const { error } = await admin.from('profiles').update(updates).eq('id', gate.userId)
    if (error) {
      console.error('[sv-onboarding] profile update:', error.message)
      return { ok: false, error: 'Speichern fehlgeschlagen.' }
    }
    return { ok: true, id: gate.userId }
  },
}
