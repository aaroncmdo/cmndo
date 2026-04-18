// AAR-497 N2: Emit-Helper. Server-seitig aufgerufen aus Domain-Actions
// (z.B. signSAandCreateFall → emitEvent('fall.created')). Schreibt Event-Row
// + triggert Worker fire-and-forget. Cron-Fallback greift falls Worker-Call
// fehlschlägt oder die Vercel-Instanz während processing stirbt.

import { createAdminClient } from '@/lib/supabase/admin'
import type { EventType, EventPayloads } from './types'

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

  const { data, error } = await supabase
    .from('notification_events')
    .insert({
      event_type: eventType,
      payload: payload as unknown as Record<string, unknown>,
      fall_id: opts?.fallId ?? payloadFallId ?? null,
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

  return { eventId: data.id }
}
