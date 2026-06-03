// Call-2 (Architektur-Entscheid 03.06.): read-only Person-Dublettenliste fuer Admins.
//
// Liest Dubletten-Kandidaten-PAARE aus der SECDEF-Funktion admin_person_dupe_candidates()
// (service_role-only; gleiche Identitaetssignale email / nachname+geburtsdatum ueber
// nicht-anonymisierte, nicht-getombstonte personen). KEIN Merge — nur Sichtbarkeit; voller
// Hard-Merge (§12-6) bleibt YAGNI bis echter Dublettendruck.
//
// db untypisiert (wie find-orphan-matches.ts), da die RPC den generierten DB-Types voraus ist
// (AGENTS Regel 2 Schritt 6 — Types deferred bis Consumer). Admin-Guard + Service-Client.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export type PersonDupeSignal = 'email' | 'name_gebdat'

export type PersonDupeCandidate = {
  person_a_id: string
  person_a_name: string | null
  person_a_created: string
  person_a_has_account: boolean
  person_b_id: string
  person_b_name: string | null
  person_b_created: string
  person_b_has_account: boolean
  signal: PersonDupeSignal
  match_value: string | null
}

/**
 * Admin-only, read-only: Dubletten-Kandidaten-Paare aus `personen`.
 * Gibt [] zurueck fuer Nicht-Admins (Defense-in-Depth zusaetzlich zum Layout-Guard)
 * und bei RPC-Fehler (non-throwing, damit die Admin-Page nicht crasht).
 */
export async function getPersonDupeCandidates(limit = 200): Promise<PersonDupeCandidate[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return []

  const svc = createServiceClient() as unknown as SupabaseClient
  const { data, error } = await svc.rpc('admin_person_dupe_candidates', { p_limit: limit })
  if (error) {
    console.error('[dupe-candidates] rpc error:', error.message)
    return []
  }
  return ((data as PersonDupeCandidate[] | null) ?? [])
}
