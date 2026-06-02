'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingFeld } from '@/components/onboarding/types'

// NUR diese Spalten darf der SV uebers Onboarding setzen. NIE paket/verifiziert/
// verifizierung_status/ist_aktiv/portal_zugang_freigeschaltet/onboarding_status/rolle
// (Mass-Assignment-Guard). fachschwerpunkte existiert NICHT auf sachverstaendige.
const SV_WHITELIST = new Set(['bvsk_mitgliedsnummer', 'ihk_zertifikat_nummer', 'oebuv_bestellungsnummer',
  'standort_adresse', 'standort_plz', 'standort_lat', 'standort_lng', 'standort_place_id', 'paket_umkreis_km'])
const PROFILE_WHITELIST = new Set(['profilbeschreibung', 'anzeigename', 'telefon'])

export function filterAufWhitelist(
  items: Array<{ tabelle: string; spalte: string; value: unknown }>,
): { sv: Record<string, unknown>; profile: Record<string, unknown>; dropped: string[] } {
  const sv: Record<string, unknown> = {}, profile: Record<string, unknown> = {}, dropped: string[] = []
  for (const it of items) {
    if (it.tabelle === 'sachverstaendige' && SV_WHITELIST.has(it.spalte)) sv[it.spalte] = it.value
    else if (it.tabelle === 'profiles' && PROFILE_WHITELIST.has(it.spalte)) profile[it.spalte] = it.value
    else dropped.push(`${it.tabelle}.${it.spalte}`)
  }
  return { sv, profile, dropped }
}

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
