'use server'

// AAR-380: Server-Actions für sv_tages_session (Field-Modus Session-State).
//
// Alle Funktionen nutzen RLS via get_sv_id() — d. h. der eingeloggte SV
// sieht nur seine eigene Session. Staff-Rollen (Admin/KB/Dispatch) sehen
// alle Sessions via sv_tages_session_staff_read Policy.

import { createClient } from '@/lib/supabase/server'
import type {
  SessionStatus,
  SvTagesSession,
} from '@/lib/types/field-modus'
import { computeTransitionPatch } from './field-state-machine'

function isoDate(datum: Date): string {
  return datum.toISOString().slice(0, 10)
}

/** Lädt die Session eines SV an einem Tag oder null. */
export async function getTagesSession(
  svId: string,
  datum: Date,
): Promise<SvTagesSession | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sv_tages_session')
    .select('*')
    .eq('sv_id', svId)
    .eq('datum', isoDate(datum))
    .maybeSingle()

  if (error) {
    console.error('[tages-session] getTagesSession:', error.message)
    return null
  }
  return (data ?? null) as SvTagesSession | null
}

/**
 * Legt eine Session an oder lädt existierende. Idempotent per
 * UNIQUE(sv_id, datum)-Constraint.
 */
export async function ensureTagesSession(
  svId: string,
  datum: Date,
  terminIds: string[],
): Promise<SvTagesSession | null> {
  const existing = await getTagesSession(svId, datum)
  if (existing) return existing

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sv_tages_session')
    .insert({
      sv_id: svId,
      datum: isoDate(datum),
      status: 'idle',
      reihenfolge_termin_ids: terminIds,
      aktueller_termin_id: terminIds[0] ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[tages-session] ensureTagesSession:', error.message)
    return null
  }
  return data as SvTagesSession
}

/**
 * Führt eine State-Transition durch (siehe field-state-machine.ts).
 * Gibt die aktualisierte Session zurück oder null bei Fehler.
 */
export async function transitionTagesSession(
  sessionId: string,
  nextStatus: SessionStatus,
  extra: Partial<SvTagesSession> = {},
): Promise<SvTagesSession | null> {
  const supabase = await createClient()
  const { data: current, error: loadErr } = await supabase
    .from('sv_tages_session')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (loadErr || !current) {
    console.error(
      '[tages-session] transitionTagesSession load:',
      loadErr?.message,
    )
    return null
  }

  const patch = computeTransitionPatch(
    current.status as SessionStatus,
    nextStatus,
  )

  const { data, error } = await supabase
    .from('sv_tages_session')
    .update({ ...patch, ...extra })
    .eq('id', sessionId)
    .select('*')
    .single()

  if (error) {
    console.error(
      '[tages-session] transitionTagesSession update:',
      error.message,
    )
    return null
  }
  return data as SvTagesSession
}

/**
 * Rotiert zum nächsten Termin in der Reihenfolge. Gibt die ID des
 * neuen aktiven Termins zurück oder null wenn das letzte abgearbeitet
 * ist (Session wird dann auf `finished` gesetzt).
 */
export async function advanceToNextTermin(
  sessionId: string,
): Promise<string | null> {
  const supabase = await createClient()
  const { data: session, error } = await supabase
    .from('sv_tages_session')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error || !session) return null

  const reihenfolge = (session.reihenfolge_termin_ids ?? []) as string[]
  const currentIndex = reihenfolge.indexOf(session.aktueller_termin_id ?? '')
  const nextId = reihenfolge[currentIndex + 1] ?? null

  if (!nextId) {
    // Keine weiteren Stops → Session finalisieren
    await transitionTagesSession(sessionId, 'finished')
    return null
  }

  await transitionTagesSession(sessionId, 'en_route', {
    aktueller_termin_id: nextId,
  })
  return nextId
}

export async function pauseTagesSession(
  sessionId: string,
): Promise<SvTagesSession | null> {
  return transitionTagesSession(sessionId, 'paused')
}

export async function resumeTagesSession(
  sessionId: string,
  resumeTo: SessionStatus = 'en_route',
): Promise<SvTagesSession | null> {
  return transitionTagesSession(sessionId, resumeTo)
}
