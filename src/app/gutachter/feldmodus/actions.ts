'use server'

// AAR-382: Server-Actions für den Fokus-Modus.
// Komponiert bestehende Libs (triggerSvLosgefahren, markArrival, tages-session
// state-machine) zu den vier Übergängen im Fokus-Modus-Lifecycle:
// Losfahren → Ankommen → Abschliessen → Pausieren.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { triggerSvLosgefahren } from '@/lib/termine/trigger-losgefahren'
import { markArrival } from '@/lib/gps/mark-arrival'
import {
  transitionTagesSession,
  advanceToNextTermin,
  pauseTagesSession,
} from '@/lib/sv/tages-session'

type Result = { success: boolean; error?: string }

/**
 * „Losfahren zum Stop" — setzt status='en_route', triggert WA an Kunden,
 * generiert Tracking-Token. Delegiert an triggerSvLosgefahren (KFZ-179).
 */
export async function startStop(
  sessionId: string,
  terminId: string,
): Promise<Result & { token?: string; etaMinutes?: number }> {
  const res = await triggerSvLosgefahren(terminId)
  if (!res.success) return { success: false, error: res.error ?? 'Losfahren fehlgeschlagen' }

  await transitionTagesSession(sessionId, 'en_route', {
    aktueller_termin_id: terminId,
  })

  revalidatePath('/gutachter/feldmodus')
  return { success: true, token: res.token, etaMinutes: res.etaMinutes }
}

/**
 * „Ich bin angekommen" — setzt gutachter_termine.sv_angekommen_am,
 * ankunft_via, gps_lat/lng_ankunft und hebt Session auf status='arrived'.
 * Sendet zusätzlich die Angekommen-WA an den Kunden (non-blocking).
 */
export async function markArrived(
  sessionId: string,
  terminId: string,
  lat: number,
  lng: number,
  via: 'geofence' | 'manuell',
): Promise<Result> {
  // markArrival nutzt `ankunft_via: 'gps' | 'manual_swipe'` — wir mappen.
  const mappedVia = via === 'geofence' ? 'gps' : 'manual_swipe'
  const res = await markArrival({ termin_id: terminId, lat, lng, via: mappedVia })
  if (!res.success) return { success: false, error: res.error ?? 'Ankunft fehlgeschlagen' }

  // gutachter_termine: sv_angekommen_am + Notification-Flag setzen (AAR-380
  // Foundation hat diese Felder bereits).
  const admin = createAdminClient()
  await admin
    .from('gutachter_termine')
    .update({
      sv_angekommen_am: new Date().toISOString(),
      notification_angekommen_gesendet_am: new Date().toISOString(),
    })
    .eq('id', terminId)

  await transitionTagesSession(sessionId, 'arrived')
  revalidatePath('/gutachter/feldmodus')
  return { success: true }
}

/**
 * Stop abschließen — setzt gutachter_termine.abschluss_zeit und rotiert zur
 * nächsten Position. Wenn es der letzte Stop war, landet die Session
 * automatisch in 'finished'.
 */
export async function completeAndAdvance(
  sessionId: string,
  terminId: string,
): Promise<Result & { nextTerminId?: string | null }> {
  const admin = createAdminClient()
  await admin
    .from('gutachter_termine')
    .update({
      abschluss_zeit: new Date().toISOString(),
      status: 'abgeschlossen',
    })
    .eq('id', terminId)

  // Zwischen-State 'completing' damit Timeline/Reporting es erkennt.
  await transitionTagesSession(sessionId, 'completing')
  const nextId = await advanceToNextTermin(sessionId)
  revalidatePath('/gutachter/feldmodus')
  revalidatePath('/gutachter/heute')
  return { success: true, nextTerminId: nextId }
}

/**
 * Fokus-Modus pausieren (Session bleibt, Status='paused'). UI navigiert
 * danach zurück nach /gutachter/heute, der Fortsetzen-Button greift dort.
 */
export async function pauseFokusmodus(sessionId: string): Promise<Result> {
  const res = await pauseTagesSession(sessionId)
  if (!res) return { success: false, error: 'Pausieren fehlgeschlagen' }
  revalidatePath('/gutachter/feldmodus')
  revalidatePath('/gutachter/heute')
  return { success: true }
}

/**
 * Live-Position-Schreiber für den Fokus-Modus. Thin wrapper über das
 * bestehende `track-position` (KFZ-158) — Auth/SV-Lookup passiert dort.
 */
export async function writeLivePosition(input: {
  lat: number
  lng: number
  accuracy_m: number
  heading: number | null
  speed_mps: number | null
}): Promise<Result> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'unauthorized' }

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, live_tracking_enabled')
    .eq('profile_id', user.id)
    .single()

  if (!sv) return { success: false, error: 'no_sv' }
  if (!sv.live_tracking_enabled) {
    return { success: false, error: 'tracking_disabled' }
  }

  const { error } = await supabase.from('sv_live_position').insert({
    gutachter_id: sv.id,
    lat: input.lat,
    lng: input.lng,
    accuracy_m: input.accuracy_m,
    heading: input.heading,
    speed_kmh:
      input.speed_mps != null
        ? Math.round(input.speed_mps * 3.6 * 10) / 10
        : null,
  })

  if (error) return { success: false, error: error.message }
  return { success: true }
}
