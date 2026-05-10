import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Eingehende WhatsApp-Nachrichten vom Baileys-VPS-Service.
 * Baileys postet hierher bei jedem messages.upsert-Event.
 *
 * Wir schreiben die Nachricht in nachrichten (richtung='inbound')
 * und verknüpfen sie mit dem Lead/Fall wenn eine Telefonnummer-Übereinstimmung
 * gefunden wird.
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

  // Lead anhand Telefonnummer suchen — normalisiert auf E.164-ähnliche Formen
  const phoneVariants = normalizePhoneVariants(phone)
  let leadId: string | null = null
  let fallId: string | null = null

  const { data: matchedLead } = await db
    .from('leads')
    .select('id, telefon')
    .in('telefon', phoneVariants)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (matchedLead) {
    leadId = matchedLead.id
    // Jüngsten offenen Fall zum Lead holen
    const { data: fall } = await db
      .from('faelle')
      .select('id')
      .eq('lead_id', leadId)
      .not('status', 'eq', 'abgeschlossen')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    fallId = fall?.id ?? null
  }

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

  return NextResponse.json({
    ok: true,
    lead_id: leadId,
    fall_id: fallId,
  })
}

function normalizePhoneVariants(raw: string): string[] {
  // Eingabe vom Baileys-Service: digits-only mit Land-Prefix (z.B. "4915123456789")
  // leads.telefon kann verschiedene Formate haben: +49..., 0151..., 4915...
  const digits = raw.replace(/\D/g, '')
  const variants = new Set<string>([raw])

  if (digits.startsWith('49')) {
    variants.add('+' + digits)           // +4915123456789
    variants.add('0' + digits.slice(2))  // 015123456789
    variants.add(digits)                 // 4915123456789
  } else if (digits.startsWith('0')) {
    variants.add('+49' + digits.slice(1))
    variants.add('49' + digits.slice(1))
    variants.add(digits)
  } else {
    variants.add('+' + digits)
  }

  return Array.from(variants)
}
