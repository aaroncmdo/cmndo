import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { processLexDriveEvent, VALID_LEXDRIVE_EVENTS, type LexDriveEvent, type LexDriveEventPayload } from '@/lib/lexdrive/process-event'

export const dynamic = 'force-dynamic'

// KFZ-209 + AAR-76 + AAR-108: LexDrive Webhook Endpoint
// Delegiert die Event-Verarbeitung an den shared processLexDriveEvent Helper.

export async function POST(req: NextRequest) {
  const secret = process.env.LEXDRIVE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })

  const rawBody = await req.text()

  // HMAC-Signature (AAR-76) oder Bearer/Shared-Secret
  const sig = req.headers.get('x-lexdrive-signature')
  let authOk = false
  if (sig) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    const provided = sig.startsWith('sha256=') ? sig.slice(7) : sig
    try {
      authOk = expected.length === provided.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    } catch { authOk = false }
  } else {
    const authHeader = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '')
    authOk = authHeader === secret
  }

  if (!authOk) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = JSON.parse(rawBody) as Record<string, unknown> } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = body.event_type as string
  const eventId = body.event_id as string
  const fallNr = body.fall_nr as string

  if (!eventType || !eventId || !fallNr) {
    return NextResponse.json({ error: 'Missing fields: event_type, event_id, fall_nr' }, { status: 400 })
  }
  if (!VALID_LEXDRIVE_EVENTS.includes(eventType as LexDriveEvent)) {
    return NextResponse.json({ error: `Unknown event_type: ${eventType}` }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: fall } = await db.from('faelle').select('id').eq('fall_nummer', fallNr).maybeSingle()

  if (!fall) {
    await db.from('webhook_events').insert({
      event_id: eventId,
      event_type: eventType,
      fall_id: null,
      fall_nr: fallNr,
      source: 'lexdrive',
      payload: body,
      status: 'skipped',
      error_message: `Fall mit Nummer ${fallNr} nicht gefunden`,
    })
    return NextResponse.json({ ok: true, skipped: true, message: `Fall ${fallNr} not found` })
  }

  const result = await processLexDriveEvent({
    fallId: fall.id,
    fallNr,
    eventType: eventType as LexDriveEvent,
    payload: body as LexDriveEventPayload,
    externalEventId: eventId,
    source: 'webhook',
  })

  if (!result.success) {
    return NextResponse.json({ error: 'Processing failed', detail: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, fall_id: fall.id, event_type: eventType, skipped: result.skipped })
}
