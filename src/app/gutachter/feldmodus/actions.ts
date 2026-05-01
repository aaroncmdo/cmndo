'use server'

// AAR-382: Server-Actions für den Fokus-Modus.
// Komponiert bestehende Libs (triggerSvLosgefahren, markArrival, tages-session
// state-machine) zu den vier Übergängen im Fokus-Modus-Lifecycle:
// Losfahren → Ankommen → Abschliessen → Pausieren.

import { revalidatePath } from 'next/cache'
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
 * Auto-Arrive: setzt gutachter_termine.sv_angekommen_am +
 * besichtigung_gestartet_am und spiegelt den Trigger auf faelle, damit BEIDE
 * Portale (SV + Kunde) via Realtime denselben "Besichtigung läuft"-Status
 * sehen. via='termin_uhrzeit' ist der Fallback wenn GPS auf einer Seite fehlt.
 */
export async function markArrived(
  sessionId: string,
  terminId: string,
  lat: number,
  lng: number,
  via: 'geofence' | 'manuell' | 'termin_uhrzeit',
): Promise<Result> {
  // markArrival nutzt `ankunft_via: 'gps' | 'manual_swipe'` — wir mappen.
  const mappedVia: 'gps' | 'manual_swipe' = via === 'geofence' ? 'gps' : 'manual_swipe'
  const res = await markArrival({ termin_id: terminId, lat, lng, via: mappedVia })
  if (!res.success) return { success: false, error: res.error ?? 'Ankunft fehlgeschlagen' }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  // gutachter_termine: SV-Ankunft + Auto-Arrive-Trigger
  const { data: terminRow } = await admin
    .from('gutachter_termine')
    .update({
      sv_angekommen_am: nowIso,
      notification_angekommen_gesendet_am: nowIso,
      besichtigung_gestartet_am: nowIso,
    })
    .eq('id', terminId)
    .select('fall_id')
    .maybeSingle()

  // faelle: Trigger spiegeln, damit Akten-Listen + Kunde-Akten-Realtime greifen
  if (terminRow?.fall_id) {
    await admin
      .from('faelle')
      .update({ besichtigung_gestartet_am: nowIso, updated_at: nowIso })
      .eq('id', terminRow.fall_id)
  }

  await transitionTagesSession(sessionId, 'arrived')
  revalidatePath('/gutachter/feldmodus')
  revalidatePath('/kunde/termin')
  if (terminRow?.fall_id) {
    revalidatePath(`/kunde/faelle/${terminRow.fall_id}`)
  }
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

