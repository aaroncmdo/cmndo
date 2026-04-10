import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// KFZ-182 Phase B: Twilio Inbound-Webhook für KB-eigene WhatsApp-Nummern.
// Twilio POST → routet Nachricht in den richtigen Fall-Chat.

function validateTwilioSignature(req: Request, params: URLSearchParams): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return false // No auth token = can't validate, reject
  const signature = req.headers.get('x-twilio-signature')
  if (!signature) return false

  const url = 'https://cmndo.vercel.app/api/twilio/inbound-kb-whatsapp'
  // Sort params alphabetically and concat
  const sortedKeys = Array.from(params.keys()).sort()
  let dataStr = url
  for (const key of sortedKeys) dataStr += key + params.get(key)

  const expected = crypto.createHmac('sha1', authToken).update(dataStr).digest('base64')
  return signature === expected
}

export async function POST(req: Request) {
  // Clone request for signature validation
  const body = await req.text()
  const formData = new URLSearchParams(body)

  // Twilio Signature Validation
  if (process.env.NODE_ENV === 'production') {
    if (!validateTwilioSignature(req, formData)) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  const db = createAdminClient()
  const from = formData.get('From') ?? '' // whatsapp:+49...
  const to = formData.get('To') ?? ''     // whatsapp:+49...
  const msgBody = formData.get('Body') ?? ''
  const messageSid = formData.get('MessageSid') ?? null
  const numMedia = parseInt(formData.get('NumMedia') ?? '0')

  // Collect media URLs
  const mediaUrls: string[] = []
  for (let i = 0; i < numMedia; i++) {
    const url = formData.get(`MediaUrl${i}`)
    if (url) mediaUrls.push(url)
  }

  // Normalize phone numbers (strip whatsapp: prefix)
  const kundenNummer = from.replace('whatsapp:', '')
  const kbNummer = to.replace('whatsapp:', '')

  // 1. Find KB by twilio_whatsapp_nummer
  const { data: kb } = await db.from('profiles')
    .select('id, vorname, nachname')
    .eq('twilio_whatsapp_nummer', kbNummer)
    .maybeSingle()

  // 2. Find customer by phone number (leads or profiles)
  let kundenName = 'Unbekannt'
  let kundenId: string | null = null

  // Check leads first (most common — Kunden antworten auf WhatsApp)
  const { data: lead } = await db.from('leads')
    .select('id, vorname, nachname')
    .eq('telefon', kundenNummer)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lead) {
    kundenName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Kunde'
  } else {
    // Check profiles (Kunden-Portal users)
    const { data: profile } = await db.from('profiles')
      .select('id, vorname, nachname')
      .eq('telefon', kundenNummer)
      .maybeSingle()
    if (profile) {
      kundenId = profile.id
      kundenName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || 'Kunde'
    }
  }

  // 3. Find the active Fall for this Kunde + KB
  let fallId: string | null = null

  if (kb) {
    // Primary: neuester aktiver Fall wo kundenbetreuer_id = KB
    const { data: faelle } = await db.from('faelle')
      .select('id')
      .eq('kundenbetreuer_id', kb.id)
      .not('status', 'in', '("abgeschlossen","storniert")')
      .order('created_at', { ascending: false })
      .limit(10)

    if (faelle?.length === 1) {
      fallId = faelle[0].id
    } else if (faelle && faelle.length > 1) {
      // Try matching by lead telefon
      if (lead) {
        const { data: matched } = await db.from('faelle')
          .select('id')
          .eq('kundenbetreuer_id', kb.id)
          .eq('lead_id', lead.id)
          .not('status', 'in', '("abgeschlossen","storniert")')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        fallId = matched?.id ?? faelle[0].id
      } else {
        fallId = faelle[0].id // Neuester Fall
      }
    }
  }

  // 4. Insert into nachrichten
  await db.from('nachrichten').insert({
    fall_id: fallId, // Can be null if no fall found
    kanal: 'whatsapp',
    richtung: 'inbound',
    sender_id: kundenId,
    sender_rolle: 'kunde',
    nachricht: msgBody || '(Medien-Nachricht)',
    hat_anhang: mediaUrls.length > 0,
    anhang_url: mediaUrls.length > 0 ? mediaUrls[0] : null,
    kb_empfaenger_id: kb?.id ?? null,
    external_id: messageSid,
  })

  // 5. Update fall.updated_at if fall found
  if (fallId) {
    await db.from('faelle').update({
      updated_at: new Date().toISOString(),
    }).eq('id', fallId)
  }

  // 6. If no fall found — create notification for all KBs
  if (!fallId) {
    const { data: kbs } = await db.from('profiles')
      .select('id')
      .eq('rolle', 'kundenbetreuer')
      .eq('aktiv', true)
    for (const k of kbs ?? []) {
      try {
        await db.from('benachrichtigungen').insert({
          user_id: k.id,
          typ: 'unbekannte-nachricht',
          titel: `Unbekannte Nummer: ${kundenNummer}`,
          text: msgBody?.slice(0, 100) || 'Medien-Nachricht',
          link: '/admin/nachrichten',
        })
      } catch { /* fire-and-forget */ }
    }
  }

  // 7. Return empty TwiML response
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response/>',
    { headers: { 'Content-Type': 'text/xml' } },
  )
}
