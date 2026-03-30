'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateProfil(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const vorname = (formData.get('vorname') as string)?.trim() || null
  const nachname = (formData.get('nachname') as string)?.trim() || null
  const telefon = (formData.get('telefon') as string)?.trim() || null

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ vorname, nachname, telefon })
    .eq('id', user.id)

  if (profileErr) throw new Error(profileErr.message)

  // Update sachverstaendige fields
  const gebiet_plz = (formData.get('gebiet_plz') as string)?.trim() || null
  const verfuegbar = formData.get('verfuegbar') === 'on'
  const standort_adresse = (formData.get('standort_adresse') as string)?.trim() || null
  const standort_plz = (formData.get('standort_plz') as string)?.trim() || null
  const standort_lat_raw = formData.get('standort_lat') as string
  const standort_lng_raw = formData.get('standort_lng') as string
  const standort_place_id = (formData.get('standort_place_id') as string)?.trim() || null
  const standort_lat = standort_lat_raw ? parseFloat(standort_lat_raw) : null
  const standort_lng = standort_lng_raw ? parseFloat(standort_lng_raw) : null

  const { error: svErr } = await supabase
    .from('sachverstaendige')
    .update({
      gebiet_plz,
      ist_aktiv: verfuegbar,
      standort_adresse,
      standort_plz,
      standort_lat: isNaN(standort_lat as number) ? null : standort_lat,
      standort_lng: isNaN(standort_lng as number) ? null : standort_lng,
      standort_place_id,
    })
    .eq('profile_id', user.id)

  if (svErr) throw new Error(svErr.message)

  revalidatePath('/gutachter/profil')
}
