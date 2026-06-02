'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingFeld } from '@/components/onboarding/types'
// Pure Whitelist-Helper liegt in einem eigenen Nicht-'use server'-File (sonst Build-Fehler:
// 'use server' darf nur async Functions exportieren — Sync-Helper/Konstanten nicht).
import { filterAufWhitelist } from './whitelist'

export async function speichereSvOnboardingStep(
  _phaseKey: string, values: Record<string, unknown>, felder: OnboardingFeld[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  const admin = createAdminClient()
  const { data: sv } = await admin.from('sachverstaendige').select('id, paket').eq('profile_id', user.id).maybeSingle()
  if (!sv || sv.paket !== 'basic') return { ok: false, error: 'Kein Basic-Onboarding fuer dieses Konto.' }

  const items = felder
    .filter((f) => f.db_target && values[f.feld_key] !== undefined)
    .map((f) => ({ tabelle: f.db_target!.tabelle, spalte: f.db_target!.spalte, value: values[f.feld_key] }))
  const { sv: svPatch, profile: profilePatch, dropped } = filterAufWhitelist(items)
  if (dropped.length) console.warn('[sv-onboarding] gedropte Nicht-Whitelist-Felder:', dropped)

  if (Object.keys(svPatch).length) {
    const { error } = await admin.from('sachverstaendige').update(svPatch).eq('id', sv.id)
    if (error) { console.error('[sv-onboarding] sv update:', error.message); return { ok: false, error: 'Speichern fehlgeschlagen.' } }
  }
  if (Object.keys(profilePatch).length) {
    const { error } = await admin.from('profiles').update(profilePatch).eq('id', user.id)
    if (error) { console.error('[sv-onboarding] profile update:', error.message); return { ok: false, error: 'Speichern fehlgeschlagen.' } }
  }
  return { ok: true }
}
