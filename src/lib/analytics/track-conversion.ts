'use server'

// 2026-05-12 Funnel v3 Backlog: Conversion-Event-Tracking fuer den
// Self-Dispatch-Funnel. Wird vom WizardClient + konvertiereAnfrageZuFall
// aufgerufen.
//
// Fire-and-forget — Tracking-Fehler duerfen den Funnel NIE blockieren.

import { createAdminClient } from '@/lib/supabase/admin'

export type ConversionEvent = {
  flow_key: string
  phase_key: string
  event_type:
    | 'phase_started'
    | 'phase_completed'
    | 'submit_started'
    | 'konvertiert'
    | 'drop_off'
  anfrage_id?: string | null
  service_typ?: string | null
  kanzlei_wunsch?: string | null
  session_id?: string | null
  user_agent?: string | null
}

export async function trackConversionEvent(event: ConversionEvent): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('conversion_events').insert({
      flow_key: event.flow_key,
      phase_key: event.phase_key,
      event_type: event.event_type,
      anfrage_id: event.anfrage_id ?? null,
      service_typ: event.service_typ ?? null,
      kanzlei_wunsch: event.kanzlei_wunsch ?? null,
      session_id: event.session_id ?? null,
      user_agent: event.user_agent ?? null,
    })
  } catch (err) {
    // Silent fail — Tracking darf den Funnel nie blockieren
    console.warn('[trackConversionEvent]', err)
  }
}
