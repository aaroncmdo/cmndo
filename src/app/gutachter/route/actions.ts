'use server'

import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { revalidatePath } from 'next/cache'
import { transitionFallStatus } from '@/lib/faelle/state-machine'

export async function markAnkunft(fallId: string, lat: number, lng: number) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) throw new Error('Kein SV-Profil')

  // Find today's termin for this fall
  const today = new Date()
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString()
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString()

  const { data: termin } = await supabase
    .from('gutachter_termine')
    .select('id')
    .eq('fall_id', fallId)
    .eq('sv_id', sv.id)
    .gte('start_zeit', dayStart)
    .lte('start_zeit', dayEnd)
    .single()

  if (termin) {
    await supabase.from('gutachter_termine').update({
      ankunft_zeit: new Date().toISOString(),
      gps_lat_ankunft: lat,
      gps_lng_ankunft: lng,
    }).eq('id', termin.id)
  }

  // KFZ-202: Status via State-Machine
  try {
    await transitionFallStatus(fallId, 'besichtigung', { user_id: user.id })
  } catch { /* Transition evtl. nicht erlaubt wenn Status schon weiter */ }

  revalidatePath('/gutachter/route')
}

export async function skipStop(fallId: string, grund: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) throw new Error('Kein SV-Profil')

  const today = new Date()
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString()
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString()

  const { data: termin } = await supabase
    .from('gutachter_termine')
    .select('id')
    .eq('fall_id', fallId)
    .eq('sv_id', sv.id)
    .gte('start_zeit', dayStart)
    .lte('start_zeit', dayEnd)
    .single()

  if (termin) {
    await supabase.from('gutachter_termine').update({
      uebersprungen: true,
      uebersprung_grund: grund,
    }).eq('id', termin.id)
  }

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'notiz',
    titel: 'Besichtigung übersprungen',
    beschreibung: `Grund: ${grund}`,
    erstellt_von: user.id,
  })

  revalidatePath('/gutachter/route')
}

export async function completeBesichtigung(fallId: string, notizen: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const sv = await getGutachterForUser(supabase, user.id, 'id')
  if (!sv) throw new Error('Kein SV-Profil')

  const today = new Date()
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString()
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString()

  const { data: termin } = await supabase
    .from('gutachter_termine')
    .select('id')
    .eq('fall_id', fallId)
    .eq('sv_id', sv.id)
    .gte('start_zeit', dayStart)
    .lte('start_zeit', dayEnd)
    .single()

  if (termin) {
    await supabase.from('gutachter_termine').update({
      abschluss_zeit: new Date().toISOString(),
      notizen_vor_ort: notizen || null,
    }).eq('id', termin.id)
  }

  // KFZ-202: Status via State-Machine (D-03 done → waiting for gutachten upload)
  try {
    await transitionFallStatus(fallId, 'gutachten-eingegangen', { user_id: user.id })
  } catch { /* Transition evtl. nicht erlaubt wenn Status schon weiter */ }

  revalidatePath('/gutachter/route')
}

export async function uploadFotoVorOrt(fallId: string, formData: FormData) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const file = formData.get('file') as File
  if (!file) throw new Error('Keine Datei')

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `gutachter-fotos/${fallId}/${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('dokumente').upload(path, file)
  if (uploadError) throw new Error(uploadError.message)

  const { data: { publicUrl } } = supabase.storage.from('dokumente').getPublicUrl(path)

  await supabase.from('dokumente').insert({
    fall_id: fallId,
    typ: 'schadensfoto',
    datei_url: publicUrl,
    datei_name: file.name,
    datei_groesse: file.size,
    kategorie: 'gutachter-foto',
    quelle: 'gutachter',
    hochgeladen_von: user.id,
    hochgeladen_von_rolle: 'sachverstaendiger',
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger'],
  })

  revalidatePath('/gutachter/route')
  return publicUrl
}
