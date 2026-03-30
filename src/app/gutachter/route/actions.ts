'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markAnkunft(fallId: string, lat: number, lng: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { data: sv } = await supabase.from('sachverstaendige').select('id').eq('profile_id', user.id).single()
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

  // Update fall status to besichtigung
  await supabase.from('faelle').update({ status: 'besichtigung' }).eq('id', fallId)

  // Timeline entry
  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'status',
    titel: 'Gutachter vor Ort angekommen',
    beschreibung: 'D-03 Besichtigung gestartet',
    erstellt_von: user.id,
  })

  revalidatePath('/gutachter/route')
}

export async function skipStop(fallId: string, grund: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { data: sv } = await supabase.from('sachverstaendige').select('id').eq('profile_id', user.id).single()
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht angemeldet')

  const { data: sv } = await supabase.from('sachverstaendige').select('id').eq('profile_id', user.id).single()
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

  // Set status D-03 done -> waiting for gutachten upload
  await supabase.from('faelle').update({ status: 'gutachten-eingegangen' }).eq('id', fallId).eq('status', 'besichtigung')

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'status',
    titel: 'Besichtigung abgeschlossen',
    beschreibung: notizen ? `Notizen: ${notizen}` : 'D-03 abgeschlossen, Gutachten-Upload erwartet',
    erstellt_von: user.id,
  })

  revalidatePath('/gutachter/route')
}

export async function uploadFotoVorOrt(fallId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
