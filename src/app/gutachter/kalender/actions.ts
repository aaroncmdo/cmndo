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

  // sv_termin Datum setzen
  const { error } = await supabase
    .from('faelle')
    .update({ sv_termin: termin })
    .eq('id', fallId)

  if (error) throw new Error(error.message)

  // KFZ-202: State-Machine statt direktem status-Update
  try {
    await transitionFallStatus(fallId, 'sv-termin', { user_id: user.id })
  } catch {
    // Transition nicht erlaubt (z.B. Status schon weiter) — sv_termin ist trotzdem gesetzt
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
