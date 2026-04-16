'use server'

// AAR-265: Server-Action für Versicherungs-Autocomplete in Phase 4 Stammdaten.
// Sucht in der versicherungen-Stammdaten-Tabelle (95+ KFZ-Versicherer im Seed)
// und liefert Top-10-Treffer mit Schaden-Kontaktdaten für Lead/Fall.

import { createClient } from '@/lib/supabase/server'

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

  const supabase = await createClient()
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
  const supabase = await createClient()
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
