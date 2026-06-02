import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { matchInboundToFall } from '@/lib/inbound/match-fall'
import { processInboundText } from '@/lib/inbound/process-inbound-text'

export const dynamic = 'force-dynamic'

/**
 * Eingehende WhatsApp-Nachrichten vom Baileys-VPS-Service.
 * Baileys postet hierher bei jedem messages.upsert-Event.
 *
 * Wir schreiben die Nachricht in nachrichten (richtung='inbound')
 * und verknüpfen sie mit dem Lead/Fall wenn eine Telefonnummer-Übereinstimmung
 * gefunden wird. Danach: Text-Intent-Prozessor (JA/NEIN/embed-B/Umtermin) —
 * gleiche Shared-Helper wie die (Legacy-)Twilio-Route.
 * Medien-Intents folgen in Task C.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    phone?: string
    text?: string
    message_id?: string
    timestamp?: number
    has_media?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const messageId = typeof body.message_id === 'string' ? body.message_id : null

  if (!phone || phone.length < 8) {
    return NextResponse.json({ error: 'missing_phone' }, { status: 400 })
  }

  const db = createAdminClient()

  // Deduplizierung via external_message_id — Baileys liefert manchmal Duplikate
  if (messageId) {
    const { data: existing } = await db
      .from('nachrichten')
      .select('id')
      .eq('external_message_id', messageId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'duplicate' })
    }
  }

  // Multi-Fall-aware Matching via matchInboundToFall (identisch zur Twilio-Route).
  const match = await matchInboundToFall(db, phone)
  const fallId = match.fallId
  const leadId = match.leadId

  const { error } = await db.from('nachrichten').insert({
    fall_id: fallId,
    kanal: 'whatsapp',
    sender_id: null,
    sender_rolle: 'kunde',
    richtung: 'inbound',
    nachricht: text || '[Medien-Nachricht]',
    hat_anhang: body.has_media === true,
    gelesen: false,
    empfaenger_kontakt: phone,
    external_message_id: messageId,
    status: 'zugestellt',
  })

  if (error) {
    console.error('[baileys/inbound] DB-Insert-Fehler:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  // Text-Intents (JA/NEIN/Umtermin) — embed-B-Resolution + Termin-Bestaetigung.
  // Medien-Intents folgen in Task C. Shared-Helper identisch zur (legacy) Twilio-Route.
  try {
    await processInboundText(db, { fromPhone: phone, body: text, match })
  } catch (e) {
    console.error('[baileys/inbound] text-intent:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({
    ok: true,
    lead_id: leadId,
    fall_id: fallId,
  })
}
