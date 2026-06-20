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

  // CMM-49: notification_events ist claim-gekeyt (claim_id). ABER fan-out.ts gatet weiterhin auf
  // event.fall_id (loadFallParticipants(fall_id) -> resolveClaimId). P0-Hotfix 2026-06-20: fall_id
  // MUSS mitgeschrieben werden, sonst liefert computeRecipients [] und die gesamte Pipeline ist fuer
  // alle fall-scoped Events dunkel (war es ~02.-20.06., still completed ohne deliveries). Folge-
  // Cleanup (CMM-49-Revier): fan-out claim-native lesen, dann kann der fall_id-Write hier wieder weg.
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
    process.env.VERCEL_URL ??
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
