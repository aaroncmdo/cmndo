import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateTwilioSignature, twilioCallbackUrl } from '@/lib/twilio/validate-signature'

export const dynamic = 'force-dynamic'

// KFZ-182 Phase B: Twilio Inbound-Webhook für KB-eigene WhatsApp-Nummern.
// Twilio POST → routet Nachricht in den richtigen Fall-Chat.

const ROUTE_PATH = '/api/twilio/inbound-kb-whatsapp'

export async function POST(req: Request) {
  // Clone request for signature validation
  const body = await req.text()
  const formData = new URLSearchParams(body)

  // Issue #1477 (Lead-Audit P0): Sig-Verify in allen Envs aktiv (vorher nur
  // production), URL aus NEXT_PUBLIC_APP_URL (vorher hardcoded cmndo.vercel.app
  // → bei VPS-Routing immer Sig-Mismatch).
  const sig = req.headers.get('x-twilio-signature')
  if (!validateTwilioSignature(sig, twilioCallbackUrl(ROUTE_PATH), formData)) {
    return new NextResponse('Forbidden', { status: 403 })
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
    // CMM-44 SP-A: kundenbetreuer_id ist faelle<->claims-DUP-Spalte. Der
    // Filter läuft jetzt über den !inner-claims-Embed (claims ist SSoT).
    // Primary: neuester aktiver Fall wo kundenbetreuer_id = KB
    const { data: faelle } = await db.from('faelle')
      .select('id, claims:claim_id!inner(kundenbetreuer_id)')
      .eq('claims.kundenbetreuer_id', kb.id)
      .not('status', 'in', '("abgeschlossen","storniert")')
      .order('created_at', { ascending: false })
      .limit(10)

    if (faelle?.length === 1) {
      fallId = faelle[0].id
    } else if (faelle && faelle.length > 1) {
      // Try matching by lead telefon
      if (lead) {
        const { data: matched } = await db.from('faelle')
          .select('id, claims:claim_id!inner(kundenbetreuer_id)')
          .eq('claims.kundenbetreuer_id', kb.id)
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
  const { data: insertedNachricht } = await db.from('nachrichten').insert({
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
  }).select('id').single()

  // 5. Update fall.updated_at if fall found
  if (fallId) {
    await db.from('faelle').update({
      updated_at: new Date().toISOString(),
    }).eq('id', fallId)
  }

  // AAR-501 N6: nachricht.received Event — nur wenn fallId bekannt
  if (fallId && insertedNachricht?.id) {
    try {
      const { emitEvent } = await import('@/lib/notifications/emit')
      await emitEvent(
        'nachricht.received',
        {
          fallId,
          nachrichtId: insertedNachricht.id as string,
          senderUserId: kundenId ?? '',
          senderRolle: 'kunde',
          inhaltPreview: (msgBody || '(Medien-Nachricht)').slice(0, 120),
        },
        { fallId, triggeredBy: kundenId ?? undefined },
      )
    } catch (err) {
      console.error('[AAR-501] emitEvent nachricht.received (inbound) failed:', err)
    }
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
