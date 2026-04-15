// AAR-183: Twilio StatusCallback — erkennt fehlgeschlagene WA-Sends
// (z.B. Kunde hat WhatsApp deinstalliert, Nummer blockiert, Meta hat die
// Nummer abgelehnt). Wenn ein WA-Send in `failed` oder `undelivered`
// landet, räumen wir bevorzugter_kanal zurück damit der nächste Send
// nicht wieder auf WA rennt.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const EMPTY_TWIML = '<Response/>'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const messageSid = String(formData.get('MessageSid') ?? '')
    const status = String(formData.get('MessageStatus') ?? '').toLowerCase()
    const errorCode = formData.get('ErrorCode') ? String(formData.get('ErrorCode')) : null
    const to = String(formData.get('To') ?? '')

    // Nur echte Failures interessieren uns hier — sent/delivered ignorieren.
    if (status !== 'failed' && status !== 'undelivered') {
      return new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } })
    }

    const isWhatsApp = to.startsWith('whatsapp:')
    const phoneE164 = to.replace(/^whatsapp:/, '')

    const db = createAdminClient()

    // Telefon-basiertes Matching: Lead oder Fall zuordnen und bevorzugter_kanal
    // auf 'sms' zurücksetzen wenn der ursprüngliche Versand WA war.
    if (isWhatsApp && phoneE164) {
      // Lead-Match
      const { data: leads } = await db
        .from('leads')
        .select('id, bevorzugter_kanal')
        .eq('telefon', phoneE164)
        .limit(3)
      for (const lead of leads ?? []) {
        if (lead.bevorzugter_kanal !== 'sms') {
          await db.from('leads').update({ bevorzugter_kanal: 'sms' }).eq('id', lead.id)
        }
      }

      // Fall-Match (über leads.kunde_id → faelle)
      const { data: faelle } = await db
        .from('faelle')
        .select('id, bevorzugter_kanal, leads!inner(telefon)')
        .eq('leads.telefon', phoneE164)
        .limit(3)
      for (const fall of (faelle ?? []) as Array<{ id: string; bevorzugter_kanal: string | null }>) {
        if (fall.bevorzugter_kanal !== 'sms') {
          await db.from('faelle').update({ bevorzugter_kanal: 'sms' }).eq('id', fall.id)
        }
      }
    }

    // Failure in ein zentrales Log — später Dashboard / Debug.
    try {
      await db.from('twilio_status_events').insert({
        message_sid: messageSid,
        status,
        error_code: errorCode,
        to_phone: phoneE164,
        was_whatsapp: isWhatsApp,
        raw: Object.fromEntries(formData.entries()),
      })
    } catch {
      // Tabelle nicht zwingend — wir loggen dann eben nur in stdout.
      console.warn('[AAR-183] StatusCallback Fehler:', { messageSid, status, errorCode, to })
    }

    return new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } })
  } catch (err) {
    console.error('[AAR-183] StatusCallback Unexpected:', err)
    // Twilio immer 200 zurückgeben (sonst Retries)
    return new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } })
  }
}
