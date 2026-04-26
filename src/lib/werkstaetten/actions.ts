'use server'

// AAR-835: Werkstätten Server Actions — anlegen + Autocomplete-Suche

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type WerkstattData = {
  name: string
  adresseStrasse?: string | null
  adressePlz?: string | null
  adresseOrt?: string | null
  telefon?: string | null
  email?: string | null
  website?: string | null
  partner?: boolean
}

export async function legeWerkstattAn(
  data: WerkstattData,
): Promise<{ ok: boolean; error?: string; werkstattId?: string }> {
  const supabase = await createClient()
  const { data: neu, error } = await supabase
    .from('werkstaetten')
    .insert({
      name:             data.name,
      adresse_strasse:  data.adresseStrasse ?? null,
      adresse_plz:      data.adressePlz    ?? null,
      adresse_ort:      data.adresseOrt    ?? null,
      telefon:          data.telefon       ?? null,
      email:            data.email         ?? null,
      website:          data.website       ?? null,
      partner:          data.partner       ?? false,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin')
  return { ok: true, werkstattId: neu.id }
}

export async function searchWerkstaetten(
  query: string,
): Promise<{ id: string; name: string; adresse_ort: string | null; partner: boolean }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('werkstaetten')
    .select('id, name, adresse_ort, partner')
    .ilike('name', `%${query}%`)
    .order('partner', { ascending: false })
    .order('name', { ascending: true })
    .limit(10)

  if (error) {
    console.error('[AAR-835] searchWerkstaetten:', error.message)
    return []
  }

  return (data ?? []).map((w) => ({
    id: w.id as string,
    name: w.name as string,
    adresse_ort: (w.adresse_ort as string | null) ?? null,
    partner: (w.partner as boolean) ?? false,
  }))
}
