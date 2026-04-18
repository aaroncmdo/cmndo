// AAR-497 N2: Notification-Worker. Wird von emitEvent() fire-and-forget
// aufgerufen (POST { eventId }) und alle 5 Minuten vom Vercel-Cron als
// Fallback (GET). Verarbeitet pending/failed-retry-bereite Events, fan-outed
// auf Empfänger × Channels und delegiert an die Channel-Handler.
//
// Retry-Backoff: 1min → 5min → 30min → 2h → dead-letter (retry_count=4).
//
// Auth:
//   - GET: Authorization: Bearer ${CRON_SECRET} (Vercel-Cron)
//   - POST: x-internal-token: ${CRON_SECRET} (emit-helper-Fire-and-Forget)

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeRecipients } from '@/lib/notifications/fan-out'
import { CHANNEL_HANDLERS } from '@/lib/notifications/channels'
import type { Channel, EventType, NotificationEvent, Role } from '@/lib/notifications/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BATCH_SIZE = 25

const BACKOFF_MINUTES = [1, 5, 30, 120]

function nextRetryAt(retryCount: number): string | null {
  if (retryCount >= BACKOFF_MINUTES.length) return null
  const minutes = BACKOFF_MINUTES[retryCount]
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

async function processSingleEvent(event: NotificationEvent): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()
  try {
    const recipients = await computeRecipients(event)

    // Bulk-Insert aller Delivery-Zeilen auf einmal (status=pending).
    const deliveryRows: Array<{
      event_id: string
      recipient_user_id: string
      recipient_role: string
      channel: Channel
    }> = []
    for (const r of recipients) {
      for (const ch of r.channels) {
        deliveryRows.push({
          event_id: event.id,
          recipient_user_id: r.userId,
          recipient_role: r.role,
          channel: ch,
        })
      }
    }

    if (deliveryRows.length === 0) {
      await supabase
        .from('notification_events')
        .update({ status: 'completed', processed_at: new Date().toISOString() })
        .eq('id', event.id)
      return { ok: true }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('notification_deliveries')
      .insert(deliveryRows)
      .select('id, recipient_user_id, recipient_role, channel')

    if (insertErr || !inserted) {
      throw insertErr ?? new Error('delivery insert failed')
    }

    // Channels parallel dispatchen.
    await Promise.allSettled(
      inserted.map(async (d) => {
        const channel = d.channel as Channel
        const handler = CHANNEL_HANDLERS[channel]
        if (!handler) {
          await supabase
            .from('notification_deliveries')
            .update({ status: 'skipped', skip_reason: 'no_handler' })
            .eq('id', d.id)
          return
        }
        try {
          const result = await handler({
            event,
            eventType: event.event_type as EventType,
            recipientUserId: d.recipient_user_id as string,
            recipientRole: d.recipient_role as Role,
            payload: event.payload,
          })
          if (result.success) {
            await supabase
              .from('notification_deliveries')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                external_id: result.externalId ?? null,
              })
              .eq('id', d.id)
          } else {
            await supabase
              .from('notification_deliveries')
              .update({
                status: result.skipReason ? 'skipped' : 'failed',
                skip_reason: result.skipReason ?? null,
                error_message: result.errorMessage ?? null,
              })
              .eq('id', d.id)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          await supabase
            .from('notification_deliveries')
            .update({ status: 'failed', error_message: msg })
            .eq('id', d.id)
        }
      }),
    )

    await supabase
      .from('notification_events')
      .update({ status: 'completed', processed_at: new Date().toISOString() })
      .eq('id', event.id)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const nextRetry = nextRetryAt(event.retry_count + 1)
    const finalStatus = nextRetry ? 'failed' : 'failed'
    await supabase
      .from('notification_events')
      .update({
        status: finalStatus,
        error_message: msg,
        retry_count: event.retry_count + 1,
        next_retry_at: nextRetry,
      })
      .eq('id', event.id)
    return { ok: false, error: msg }
  }
}

/**
 * Holt bis zu BATCH_SIZE pending oder retry-bereite Events. Nutzt eine RPC
 * mit FOR UPDATE SKIP LOCKED — siehe SQL unten. Alternative: einzeln via
 * update ... where status=pending returning — für MVP reicht das.
 */
async function claimPendingEvents(): Promise<NotificationEvent[]> {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  // MVP: Zwei-Schritt-Claim. Erst select IDs (ohne Lock), dann update-returning
  // nur die Rows, die noch pending/retry-due sind. Race-condition-sicher durch
  // den Status-Filter im update.
  const { data: candidates } = await supabase
    .from('notification_events')
    .select('id')
    .or(`status.eq.pending,and(status.eq.failed,next_retry_at.lte.${nowIso})`)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  const ids = (candidates ?? []).map((r) => r.id as string)
  if (ids.length === 0) return []

  const { data: claimed, error } = await supabase
    .from('notification_events')
    .update({ status: 'processing' })
    .in('id', ids)
    .or(`status.eq.pending,and(status.eq.failed,next_retry_at.lte.${nowIso})`)
    .select('*')

  if (error) {
    console.error('[worker] claim failed', error)
    return []
  }
  return (claimed ?? []) as NotificationEvent[]
}

async function processBatch(): Promise<{ processed: number; failed: number }> {
  const events = await claimPendingEvents()
  if (events.length === 0) return { processed: 0, failed: 0 }

  let failed = 0
  for (const event of events) {
    const result = await processSingleEvent(event)
    if (!result.ok) failed += 1
  }
  return { processed: events.length, failed }
}

async function processSingleById(eventId: string): Promise<{ processed: number; failed: number }> {
  const supabase = createAdminClient()
  // Claim nur die eine Event-Row wenn sie noch pending ist.
  const { data: claimed } = await supabase
    .from('notification_events')
    .update({ status: 'processing' })
    .eq('id', eventId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()

  if (!claimed) return { processed: 0, failed: 0 }

  const result = await processSingleEvent(claimed as NotificationEvent)
  return { processed: 1, failed: result.ok ? 0 : 1 }
}

export async function POST(req: Request) {
  const token = req.headers.get('x-internal-token')
  const authHeader = req.headers.get('authorization')
  const expected = process.env.CRON_SECRET ?? ''
  const ok = token === expected || authHeader === `Bearer ${expected}`
  if (!ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { eventId?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const result = body.eventId
    ? await processSingleById(body.eventId)
    : await processBatch()

  return NextResponse.json({ ok: true, ...result })
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await processBatch()
  return NextResponse.json({ ok: true, ...result })
}
