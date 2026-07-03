// AAR-497 N2: Emit-Helper. Server-seitig aufgerufen aus Domain-Actions
// (z.B. signSAandCreateFall → emitEvent('fall.created')). Schreibt Event-Row
// + triggert Worker fire-and-forget. Cron-Fallback greift falls Worker-Call
// fehlschlägt oder die Vercel-Instanz während processing stirbt.
//
// AAR-764: Nach dem Event-Insert läuft der Mitteilungs-Resolver und legt
// Tasks basierend auf der EVENT_TO_TASK-Map an. Fire-and-forget wie der
// Worker-Trigger — Fehler werden geloggt aber blockieren den Caller nicht.

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import type { EventType, EventPayloads } from './types'
import { resolveTasksFromEvent } from '@/lib/resolver/resolve-tasks-from-event'

export async function emitEvent<T extends EventType>(
  eventType: T,
  payload: EventPayloads[T],
  opts?: { fallId?: string; triggeredBy?: string },
): Promise<{ eventId: string }> {
  const supabase = createAdminClient()

  // fallId aus Options oder aus Payload (alle Events außer makler.lead_eingegangen haben fallId).
  const payloadFallId =
    typeof (payload as { fallId?: unknown }).fallId === 'string'
      ? ((payload as { fallId: string }).fallId)
      : undefined

  // CMM-49: notification_events ist claim-gekeyt (claim_id). fan-out.ts gatet jetzt claim-native auf
  // event.claim_id (loadClaimParticipants) -> die Pipeline haengt NICHT mehr an fall_id (das war der
  // P0-Dunkel-Bug 02.-20.06., #3050). claim_id MUSS also gesetzt sein (resolveClaimId unten; die
  // Invariante „jeder Fall hat einen Claim" haelt). fall_id wird weiter mitgeschrieben fuer noch nicht
  // claim-native Konsumenten (Queries/Debug) + den rueckruf-Trigger (819dab90); Drop = Folge-Cleanup
  // nach einem fall_id-Reader-Audit.
  const effectiveFallId = opts?.fallId ?? payloadFallId ?? null
  let claimId: string | null = null
  if (effectiveFallId) {
    claimId = await resolveClaimId(supabase, effectiveFallId)
  }

  const { data, error } = await supabase
    .from('notification_events')
    .insert({
      event_type: eventType,
      payload: payload as unknown as Record<string, unknown>,
      fall_id: effectiveFallId,
      claim_id: claimId,
      triggered_by_user_id: opts?.triggeredBy ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[emit] insert failed', error)
    throw error ?? new Error('emit failed')
  }

  // Fire-and-forget Worker-Trigger. Kein await — wenn es fehlschlägt, nimmt
  // der Cron (*/5 min) die pending-Row im nächsten Lauf auf.
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_URL ??
    'http://localhost:3000'

  const fullUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`

  fetch(`${fullUrl}/api/notifications/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': process.env.CRON_SECRET ?? '',
    },
    body: JSON.stringify({ eventId: data.id }),
  }).catch((e) => {
    console.error('[emit] worker-trigger failed (fallback-cron nimmt es auf):', e)
  })

  // AAR-764: Tasks aus Event ableiten — fire-and-forget, blockiert den
  // Caller nicht. Resolver logged intern bei Fehlern.
  resolveTasksFromEvent(
    eventType,
    payload as unknown as Record<string, unknown>,
    {
      fallId: effectiveFallId,
      triggeredBy: opts?.triggeredBy ?? null,
      eventId: data.id,
    },
  ).catch((e) => {
    console.error('[emit] AAR-764 task-resolver failed:', e)
  })

  return { eventId: data.id }
}
