// AAR-183: Twilio StatusCallback — erkennt fehlgeschlagene WA-Sends
// (z.B. Kunde hat WhatsApp deinstalliert, Nummer blockiert, Meta hat die
// Nummer abgelehnt). Wenn ein WA-Send in `failed` oder `undelivered`
// landet, räumen wir bevorzugter_kanal zurück damit der nächste Send
// nicht wieder auf WA rennt.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateTwilioSignature, twilioCallbackUrl } from '@/lib/twilio/validate-signature'

export const dynamic = 'force-dynamic'

const EMPTY_TWIML = '<Response/>'
const ROUTE_PATH = '/api/webhooks/twilio/status'

export async function POST(req: NextRequest) {
  try {
    // A08: Twilio-Signatur ueber den ROHEN Body verifizieren, BEVOR wir handeln — sonst
    // kann jeder per gefaelschtem MessageStatus=failed&To=whatsapp:+49... den
    // bevorzugter_kanal fremder Telefonnummern auf 'sms' kippen (unauth State-Mutation +
    // twilio_status_events-Pollution). Muster wie die Schwester-Route twilio/inbound.
    const bodyText = await req.text()
    const formParams = new URLSearchParams(bodyText)
    const sig = req.headers.get('x-twilio-signature')
    if (!validateTwilioSignature(sig, twilioCallbackUrl(ROUTE_PATH), formParams)) {
      return new NextResponse('Forbidden', { status: 403 })
    }
    const messageSid = String(formParams.get('MessageSid') ?? '')
    const status = String(formParams.get('MessageStatus') ?? '').toLowerCase()
    const errorCode = formParams.get('ErrorCode') ? String(formParams.get('ErrorCode')) : null
    const to = String(formParams.get('To') ?? '')

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
          // Kanal-Umschaltung nach WhatsApp-Zustellfehler. Bleibt sie aus, laufen
          // weitere Nachrichten erneut ueber den Kanal, der gerade nicht ankam.
          const { error: kanalLeadFehler } = await db
            .from('leads')
            .update({ bevorzugter_kanal: 'sms' })
            .eq('id', lead.id)
          if (kanalLeadFehler) console.error(`[twilio-status] Kanalwechsel lead ${lead.id}:`, kanalLeadFehler.message)
        }
      }

      // CMM-44 SP-B PR2a: bevorzugter_kanal lebt jetzt auf claims (SSoT).
      // CMM-49 (faelle-Drop-Runway): claims-direkt statt faelle (claims hat lead_id -> leads);
      // bevorzugter_kanal in einem Query mitgelesen (spart den separaten claims-Re-Read).
      const { data: claims } = await db
        .from('claims')
        .select('id, bevorzugter_kanal, leads:lead_id!inner(telefon)')
        .eq('leads.telefon', phoneE164)
        .limit(3)
      for (const claim of (claims ?? []) as Array<{ id: string; bevorzugter_kanal: string | null }>) {
        if (claim.bevorzugter_kanal !== 'sms') {
          const { error: kanalClaimFehler } = await db
            .from('claims')
            .update({ bevorzugter_kanal: 'sms' })
            .eq('id', claim.id)
          if (kanalClaimFehler) console.error(`[twilio-status] Kanalwechsel claim ${claim.id}:`, kanalClaimFehler.message)
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
        raw: Object.fromEntries(formParams.entries()),
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
