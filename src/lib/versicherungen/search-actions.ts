'use server'

// Versicherer-Stammdaten-Suche (oeffentliche Referenzdaten: 95+ KFZ-Versicherer).
// AAR-956: aus dem dispatch-privaten _actions/versicherungen.ts in eine neutrale,
// domaenenuebergreifende Lib gezogen — Consumer sind jetzt Dispatch (Stammdaten),
// faelle (getById) UND der anonyme /flow (gegner_versicherung-Autocomplete).
//
// Admin-Client (service_role) statt SSR-Auth-Client: die versicherungen-Tabelle ist
// RLS-geschuetzt (nur `authenticated` SELECT), der /flow laeuft aber ANONYM → der
// Auth-Client laege bei 0 Treffern. Die Daten sind reine oeffentliche Referenzdaten
// (Versicherer-Name + Schaden-Kontakt, KEIN Kunden-PII) und die Projektion ist fix +
// leak-sicher, daher ist der anon-erreichbare Service-Role-Read unbedenklich.

import { createAdminClient } from '@/lib/supabase/admin'

export type VersicherungSuggestion = {
  id: string
  name: string
  schaden_telefon: string | null
  schaden_email: string | null
  bafin_nummer: string | null
}

export async function searchVersicherungen(query: string): Promise<VersicherungSuggestion[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('versicherungen')
    .select('id, name, schaden_telefon, schaden_email, bafin_nummer')
    .eq('ist_aktiv', true)
    .ilike('name', `%${trimmed}%`)
    .order('name')
    .limit(10)

  if (error) {
    console.error('[AAR-265] searchVersicherungen Fehler:', error)
    return []
  }
  return data ?? []
}

export async function getVersicherungById(id: string): Promise<VersicherungSuggestion | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('versicherungen')
    .select('id, name, schaden_telefon, schaden_email, bafin_nummer')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[AAR-265] getVersicherungById Fehler:', error)
    return null
  }
  return data
}
