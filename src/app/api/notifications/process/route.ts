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
import { EVENT_MATRIX } from '@/lib/notifications/channel-matrix'
import { decideDeliveries } from '@/lib/notifications/preferences'
import type { Channel, EventType, NotificationEvent, Role } from '@/lib/notifications/types'
import { processOutboxBatch, drainSingleOutbox } from '@/lib/notifications/outbox-worker'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BATCH_SIZE = 25

const BACKOFF_MINUTES = [1, 5, 30, 120]

// Lease-Dauer fuer 'processing'-Claims. Laeuft sie ab (Worker-Instanz waehrend processing
// gestorben), wird das Event wieder aufgenommen statt ewig 'processing' zu haengen.
const PROCESSING_LEASE_MINUTES = 10

function nextRetryAt(retryCount: number): string | null {
  if (retryCount >= BACKOFF_MINUTES.length) return null
  const minutes = BACKOFF_MINUTES[retryCount]
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

async function processSingleEvent(event: NotificationEvent): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()
  try {
    const recipients = await computeRecipients(event)

    // AAR-500 N5: Pro Empfänger Preferences auswerten. Skipped-Rows werden
    // trotzdem eingetragen (status='skipped' + skip_reason), damit der Audit-
    // Log nachvollziehbar bleibt — aber NICHT dispatched.
    const priority = EVENT_MATRIX[event.event_type as EventType]?.priority ?? 'normal'
    const now = new Date()
    type PreparedRow = {
      event_id: string
      recipient_user_id: string
      recipient_role: string
      channel: Channel
      status: 'pending' | 'skipped'
      skip_reason: string | null
    }
    const deliveryRows: PreparedRow[] = []
    for (const r of recipients) {
      const items = r.channels.map((channel) => ({
        eventType: event.event_type as EventType,
        channel,
        priority,
      }))
      const decisions = await decideDeliveries(r.userId, items, now)
      r.channels.forEach((channel, idx) => {
        const decision = decisions[idx]
        deliveryRows.push({
          event_id: event.id,
          recipient_user_id: r.userId,
          recipient_role: r.role,
          channel,
          status: decision.deliver ? 'pending' : 'skipped',
          skip_reason: decision.deliver ? null : decision.skipReason ?? null,
        })
      })
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
      .select('id, recipient_user_id, recipient_role, channel, status, skip_reason')

    if (insertErr || !inserted) {
      throw insertErr ?? new Error('delivery insert failed')
    }

    // Channels parallel dispatchen — nur status='pending'. Skipped-Rows bleiben wie sie sind.
    await Promise.allSettled(
      inserted.map(async (d) => {
        if (d.status === 'skipped') return
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
    // nextRetry === null → Retries ausgeschoepft. Es gibt keinen 'dead_letter'-Status im CHECK-
    // Constraint; terminal ist ein Event durch status='failed' MIT next_retry_at=NULL (der Claim-
    // Filter verlangt next_retry_at <= now; NULL matcht das nie → wird nie mehr reclaimed).
    // Dead-Letter-Monitoring: WHERE status='failed' AND next_retry_at IS NULL.
    await supabase
      .from('notification_events')
      .update({
        status: 'failed',
        error_message: nextRetry ? msg : `[dead-letter nach ${event.retry_count + 1} Versuchen] ${msg}`,
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
  const leaseIso = new Date(Date.now() + PROCESSING_LEASE_MINUTES * 60 * 1000).toISOString()

  // MVP: Zwei-Schritt-Claim. Erst select IDs (ohne Lock), dann update-returning nur die Rows, die
  // noch pending/retry-due/lease-abgelaufen sind. Race-condition-sicher durch den Status-Filter im
  // update. Beim Claim setzen wir next_retry_at = now + Lease; ein 'processing'-Event mit
  // abgelaufener Lease (Instanz gestorben) wird so wieder aufgenommen statt ewig zu haengen.
  const claimFilter =
    `status.eq.pending,` +
    `and(status.eq.failed,next_retry_at.lte.${nowIso}),` +
    `and(status.eq.processing,next_retry_at.lte.${nowIso})`

  const { data: candidates } = await supabase
    .from('notification_events')
    .select('id')
    .or(claimFilter)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  const ids = (candidates ?? []).map((r) => r.id as string)
  if (ids.length === 0) return []

  const { data: claimed, error } = await supabase
    .from('notification_events')
    .update({ status: 'processing', next_retry_at: leaseIso })
    .in('id', ids)
    .or(claimFilter)
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
    .update({
      status: 'processing',
      next_retry_at: new Date(Date.now() + PROCESSING_LEASE_MINUTES * 60 * 1000).toISOString(),
    })
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

  let body: { eventId?: string; outboxDedupKey?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  // C3a: outboxDedupKey -> Immediate-Drain der einen just-enqueued Outbox-Row (Latenz-Erhalt).
  const result = body.outboxDedupKey
    ? await drainSingleOutbox(body.outboxDedupKey)
    : body.eventId
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
  // C3a: derselbe */5min-Cron drant zusaetzlich die notifications_outbox (keine neue Cron-Registrierung).
  // Defensiv gewrappt: ein Outbox-Fehler darf den kritischen Event-Cron nicht brechen.
  let outbox = { processed: 0, failed: 0 }
  try {
    outbox = await processOutboxBatch()
  } catch (e) {
    console.error('[cron] outbox drain failed', e)
  }
  return NextResponse.json({ ok: true, ...result, outbox })
}
