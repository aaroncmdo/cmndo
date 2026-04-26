// AAR-826: Notification-Worker — verarbeitet pending notification_events
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Pending Events abholen (FOR UPDATE SKIP LOCKED via RPC nicht möglich in Supabase JS client,
  // daher optimistisches Locking: zuerst als 'processing' markieren)
  const { data: events, error } = await admin
    .from('notification_events')
    .select('id, event_type, payload, fall_id')
    .eq('status', 'pending')
    .lte('next_retry_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, checked_at: new Date().toISOString() })
  }

  // Als processing markieren
  await admin
    .from('notification_events')
    .update({ status: 'processing' })
    .in('id', events.map(e => e.id))

  // Fan-out auf Notification-Deliveries
  // Implementierung separat in lib/notifications/process-event.ts
  // Stub: direkt auf 'sent' setzen
  let processed = 0
  for (const event of events) {
    const { error: updateErr } = await admin
      .from('notification_events')
      .update({ status: 'sent', processed_at: new Date().toISOString() })
      .eq('id', event.id)

    if (!updateErr) processed++
  }

  return NextResponse.json({
    ok: true,
    found: events.length,
    processed,
    checked_at: new Date().toISOString(),
  })
}
