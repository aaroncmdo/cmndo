'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getGutachterForUser } from '@/lib/gutachter'
import { ablehnTermin } from '@/lib/termine/sv-ablehnung'
import { gegenvorschlagTermin } from '@/lib/termine/sv-gegenvorschlag'
import { transitionFallStatus } from '@/lib/faelle/state-machine'

export async function setTermin(
  fallId: string,
  termin: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { success: false, error: 'Kein Sachverständiger gefunden' }
  const { data: fall } = await supabase.from('faelle').select('id').eq('id', fallId).eq('sv_id', sv.id).maybeSingle()
  if (!fall) return { success: false, error: 'Nicht autorisiert' }

  // Termin-Datum setzen: upsert in gutachter_termine statt auf faelle.sv_termin
  const startZeit = new Date(termin)
  const endZeit = new Date(startZeit.getTime() + 90 * 60 * 1000)

  // AAR-704C: ALLE aktiven Termine dieses SVs für diesen Fall holen
  // (Doppelungs-Bug: vorher wurde nur der jüngste upgedated, ältere blieben
  // aktiv → Fallansicht zog den falschen Termin). Den jüngsten upgraden,
  // alle weiteren cancelen.
  const { data: aktiveTermine } = await supabase
    .from('gutachter_termine')
    .select('id, created_at')
    .eq('fall_id', fallId)
    .eq('sv_id', sv.id)
    .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })

  const aktive = aktiveTermine ?? []
  const primary = aktive[0] ?? null
  const altere = aktive.slice(1)

  let syncTerminId: string | null = null

  if (primary) {
    const { error } = await supabase
      .from('gutachter_termine')
      .update({ start_zeit: startZeit.toISOString(), end_zeit: endZeit.toISOString(), status: 'bestaetigt' })
      .eq('id', primary.id)
    if (error) return { success: false, error: error.message }
    syncTerminId = primary.id as string
  } else {
    const { data: inserted, error } = await supabase
      .from('gutachter_termine')
      .insert({ fall_id: fallId, sv_id: sv.id, start_zeit: startZeit.toISOString(), end_zeit: endZeit.toISOString(), status: 'bestaetigt' })
      .select('id')
      .single()
    if (error) return { success: false, error: error.message }
    syncTerminId = (inserted?.id as string | null) ?? null
  }

  // 2026-05-06: SV-Termin in Google- + CalDAV-Kalender schreiben.
  // Non-critical, parallel — beide no-op'en wenn der jeweilige Provider
  // nicht verbunden ist.
  if (syncTerminId) {
    const tid = syncTerminId
    await Promise.all([
      (async () => {
        try {
          const { syncSvTerminToGoogle } = await import('@/lib/google-calendar/sv-termin-sync')
          await syncSvTerminToGoogle(tid, fallId)
        } catch (err) {
          console.error('[sv-termin-sync] Google SV-Selbst-Eintrag:', err)
        }
      })(),
      (async () => {
        try {
          const { syncSvTerminToCalDav } = await import('@/lib/kalender/caldav/sv-termin-sync')
          await syncSvTerminToCalDav(tid, fallId)
        } catch (err) {
          console.error('[sv-termin-sync] CalDAV SV-Selbst-Eintrag:', err)
        }
      })(),
    ])
  }

  // AAR-704C: ältere aktive Termine cancellen damit nur einer aktiv bleibt
  if (altere.length > 0) {
    await supabase
      .from('gutachter_termine')
      .update({
        status: 'storniert',
        cancelled_at: new Date().toISOString(),
        sv_ablehnung_grund: 'Vom SV durch neuen Termin ersetzt (manuelle Verschiebung)',
      })
      .in('id', altere.map((t) => t.id as string))
  }

  // AAR-704C: ältere aktive Termine cancellen damit nur einer aktiv bleibt
  if (altere.length > 0) {
    await supabase
      .from('gutachter_termine')
      .update({
        status: 'storniert',
        cancelled_at: new Date().toISOString(),
        sv_ablehnung_grund: 'Vom SV durch neuen Termin ersetzt (manuelle Verschiebung)',
      })
      .in('id', altere.map((t) => t.id as string))
  }

  // KFZ-202: State-Machine statt direktem status-Update
  try {
    await transitionFallStatus(fallId, 'sv-termin', { user_id: user.id })
  } catch {
    // Transition nicht erlaubt (z.B. Status schon weiter) — Termin ist trotzdem gesetzt
  }

  revalidatePath('/gutachter/kalender')
  revalidatePath('/gutachter')
  return { success: true }
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
