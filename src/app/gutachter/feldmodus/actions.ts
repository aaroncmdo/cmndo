'use server'

// AAR-382: Server-Actions für den Fokus-Modus.
// Komponiert bestehende Libs (triggerSvLosgefahren, markArrival, tages-session
// state-machine) zu den vier Übergängen im Fokus-Modus-Lifecycle:
// Losfahren → Ankommen → Abschliessen → Pausieren.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
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
 * SV erreicht den Besichtigungsort: setzt nur sv_angekommen_am.
 * Triggert NICHT besichtigung_gestartet_am — das passiert erst wenn beide
 * Parteien da sind (markBesichtigungGestartet) oder die Zeit erreicht ist.
 * Idempotent: wenn sv_angekommen_am bereits gesetzt, wird nichts überschrieben.
 */
export async function markSvVorOrt(
  terminId: string,
  lat: number,
  lng: number,
  via: 'geofence' | 'manuell',
): Promise<Result> {
  const mappedVia: 'gps' | 'manual_swipe' = via === 'geofence' ? 'gps' : 'manual_swipe'
  const res = await markArrival({ termin_id: terminId, lat, lng, via: mappedVia })
  if (!res.success) return { success: false, error: res.error ?? 'Ankunft fehlgeschlagen' }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const { data: existing } = await admin
    .from('gutachter_termine')
    .select('sv_angekommen_am, fall_id')
    .eq('id', terminId)
    .maybeSingle()
  if (!existing?.sv_angekommen_am) {
    await admin
      .from('gutachter_termine')
      .update({
        sv_angekommen_am: nowIso,
        notification_angekommen_gesendet_am: nowIso,
      })
      .eq('id', terminId)
  }
  revalidatePath('/gutachter/feldmodus')
  if (existing?.fall_id) {
    revalidatePath(`/kunde/faelle/${existing.fall_id}`)
  }
  return { success: true }
}

/**
 * Besichtigung-läuft-Trigger: beide vor Ort ODER Zeit-Fallback.
 * Setzt besichtigung_gestartet_am auf gutachter_termine (SSoT) und
 * transitioniert die Session in den arrived-State (öffnet die Fallakte
 * beim SV via Realtime-Sub im FeldmodusClient).
 */
export async function markBesichtigungGestartet(
  sessionId: string,
  terminId: string,
  via: 'beide_angekommen' | 'termin_uhrzeit',
): Promise<Result> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: existing } = await admin
    .from('gutachter_termine')
    .select('besichtigung_gestartet_am, sv_angekommen_am, fall_id')
    .eq('id', terminId)
    .maybeSingle()

  if (existing?.besichtigung_gestartet_am) {
    return { success: true }
  }

  // Bei Zeit-Fallback ohne GPS: sv_angekommen_am ebenfalls setzen, damit
  // der KundeSvLiveBanner / die ClaimStepper-Status-Logik konsistent ist.
  const update: Record<string, string> = { besichtigung_gestartet_am: nowIso }
  if (via === 'termin_uhrzeit' && !existing?.sv_angekommen_am) {
    update.sv_angekommen_am = nowIso
    update.notification_angekommen_gesendet_am = nowIso
  }

  await admin
    .from('gutachter_termine')
    .update(update)
    .eq('id', terminId)

  // CMM-44 SP-H PR2: der fruehere faelle.besichtigung_gestartet_am-Dual-Write
  // entfaellt. besichtigung_gestartet_am wird von gutachter_termine gelesen
  // (SSoT, oben gesetzt) — der faelle-Mirror wurde nie produktiv gelesen und
  // stirbt mit faelle in Phase 6.

  await transitionTagesSession(sessionId, 'arrived')
  revalidatePath('/gutachter/feldmodus')
  revalidatePath('/kunde/termin')
  if (existing?.fall_id) {
    revalidatePath(`/kunde/faelle/${existing.fall_id}`)
  }
  return { success: true }
}

/** @deprecated Übergangs-Wrapper bis alle Caller umgestellt sind. */
export async function markArrived(
  sessionId: string,
  terminId: string,
  lat: number,
  lng: number,
  via: 'geofence' | 'manuell' | 'termin_uhrzeit',
): Promise<Result> {
  if (via === 'termin_uhrzeit') {
    return markBesichtigungGestartet(sessionId, terminId, 'termin_uhrzeit')
  }
  // Sonst: nur SV vor Ort markieren — Besichtigung-läuft kommt separat.
  return markSvVorOrt(terminId, lat, lng, via as 'geofence' | 'manuell')
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
 * 2026-05-07 (Aaron-Smoke): Exit-zurück-zur-Anfahrt aus dem arrived-Modus.
 * Setzt session.status zurück auf idle UND macht den Auto-Arrive-Flag am
 * Termin rückgängig (sv_angekommen_am=null, besichtigung_gestartet_am=null)
 * damit der Fallback-Timer nicht direkt wieder triggert.
 *
 * Nutzungsfall: SV ist versehentlich im Vor-Ort-Modus gelandet (Termin-
 * Uhrzeit-Fallback) aber er ist noch nicht da. Click → zurück zur Map.
 */
export async function exitArrivedToRoute(
  sessionId: string,
  terminId: string,
): Promise<Result> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }
  const admin = createAdminClient()
  const { error: sessErr } = await admin
    .from('sv_tages_session')
    .update({ status: 'idle' })
    .eq('id', sessionId)
  if (sessErr) return { success: false, error: sessErr.message }
  const { error: tErr } = await admin
    .from('gutachter_termine')
    .update({ sv_angekommen_am: null, besichtigung_gestartet_am: null })
    .eq('id', terminId)
  if (tErr) return { success: false, error: tErr.message }
  revalidatePath('/gutachter/feldmodus')
  return { success: true }
}

