'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getGutachterForUser } from '@/lib/gutachter'
import { ablehnTermin } from '@/lib/termine/sv-ablehnung'
import { gegenvorschlagTermin } from '@/lib/termine/sv-gegenvorschlag'
import { transitionFallStatus } from '@/lib/faelle/state-machine'

export async function setTermin(fallId: string, termin: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) throw new Error('Kein Sachverstaendiger gefunden')
  const { data: fall } = await supabase.from('faelle').select('id').eq('id', fallId).eq('sv_id', sv.id).maybeSingle()
  if (!fall) throw new Error('Nicht autorisiert')

  // Termin-Datum setzen: upsert in gutachter_termine statt auf faelle.sv_termin
  const startZeit = new Date(termin)
  const endZeit = new Date(startZeit.getTime() + 90 * 60 * 1000)

  const { data: existing } = await supabase
    .from('gutachter_termine')
    .select('id')
    .eq('fall_id', fallId)
    .eq('sv_id', sv.id)
    .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('gutachter_termine')
      .update({ start_zeit: startZeit.toISOString(), end_zeit: endZeit.toISOString(), status: 'bestaetigt' })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('gutachter_termine')
      .insert({ fall_id: fallId, sv_id: sv.id, start_zeit: startZeit.toISOString(), end_zeit: endZeit.toISOString(), status: 'bestaetigt' })
    if (error) throw new Error(error.message)
  }

  // KFZ-202: State-Machine statt direktem status-Update
  try {
    await transitionFallStatus(fallId, 'sv-termin', { user_id: user.id })
  } catch {
    // Transition nicht erlaubt (z.B. Status schon weiter) — Termin ist trotzdem gesetzt
  }

  revalidatePath('/gutachter/kalender')
  revalidatePath('/gutachter')
}

/**
 * KFZ-192: SV lehnt Termin aus dem Kalender ab.
 */
export async function ablehnTerminAction(
  terminId: string,
  grund: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return { success: false, error: 'Nicht angemeldet' }

    // Zugehörigkeit prüfen: SV darf nur eigene Termine ablehnen
    const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
    if (!sv) return { success: false, error: 'Kein SV-Profil' }

    const { data: termin } = await supabase
      .from('gutachter_termine')
      .select('id')
      .eq('id', terminId)
      .eq('sv_id', sv.id)
      .maybeSingle()

    if (!termin) return { success: false, error: 'Termin nicht gefunden oder nicht autorisiert' }

    await ablehnTermin(terminId, grund)

    revalidatePath('/gutachter/kalender')
    revalidatePath('/gutachter/termine')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * KFZ-192: SV macht Gegenvorschlag aus dem Kalender.
 */
export async function gegenvorschlagAction(
  terminId: string,
  slots: Array<{ datum: string; uhrzeit: string }>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return { success: false, error: 'Nicht angemeldet' }

    const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
    if (!sv) return { success: false, error: 'Kein SV-Profil' }

    const { data: termin } = await supabase
      .from('gutachter_termine')
      .select('id')
      .eq('id', terminId)
      .eq('sv_id', sv.id)
      .maybeSingle()

    if (!termin) return { success: false, error: 'Termin nicht gefunden oder nicht autorisiert' }

    await gegenvorschlagTermin(terminId, slots)

    revalidatePath('/gutachter/kalender')
    revalidatePath('/gutachter/termine')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
