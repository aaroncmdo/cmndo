// AAR-94: Twilio Inbound Webhook fuer WhatsApp-Replies (JA/NEIN/Foto/...)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCommunication } from '@/lib/communications/send'

export const dynamic = 'force-dynamic'

async function parseTwilioBody(req: NextRequest): Promise<Record<string, string>> {
  const formData = await req.formData()
  const result: Record<string, string> = {}
  formData.forEach((v, k) => { result[k] = String(v) })
  return result
}

const EMPTY_TWIML = '<Response/>'

export async function POST(req: NextRequest) {
  const body = await parseTwilioBody(req)
  const messageSid = body.MessageSid
  const fromPhone = (body.From ?? '').replace('whatsapp:', '')
  const toPhone = (body.To ?? '').replace('whatsapp:', '')
  const messageBody = (body.Body ?? '').trim()
  const numMedia = parseInt(body.NumMedia ?? '0', 10)

  if (!messageSid || !fromPhone) {
    return NextResponse.json({ error: 'Invalid Twilio payload' }, { status: 400 })
  }

  const db = createAdminClient()

  // Idempotenz
  const { data: existing } = await db
    .from('whatsapp_inbound_messages')
    .select('id')
    .eq('twilio_message_sid', messageSid)
    .maybeSingle()
  if (existing) {
    return new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } })
  }

  // Media-URLs
  const mediaUrls: string[] = []
  for (let i = 0; i < numMedia; i++) {
    const url = body[`MediaUrl${i}`]
    if (url) mediaUrls.push(url)
  }

  // Lead/Fall via Telefon matchen
  let matchedLeadId: string | null = null
  let matchedFallId: string | null = null
  let matchedTerminId: string | null = null

  const { data: leads } = await db
    .from('leads')
    .select('id, konvertiert_zu_fall_id')
    .eq('telefon', fromPhone)
    .order('created_at', { ascending: false })
    .limit(1)

  if (leads?.[0]) {
    matchedLeadId = leads[0].id
    matchedFallId = leads[0].konvertiert_zu_fall_id ?? null
  }

  if (matchedFallId) {
    const { data: termin } = await db
      .from('gutachter_termine')
      .select('id')
      .eq('fall_id', matchedFallId)
      .gte('start_zeit', new Date().toISOString())
      .order('start_zeit', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (termin) matchedTerminId = termin.id
  }

  // Intent Detection
  const upper = messageBody.toUpperCase()
  let intent = 'unknown'
  if (numMedia > 0) intent = 'dokument_upload'
  else if (['JA', 'OK', 'BESTAETIGT', 'BESTÄTIGT', 'JAA'].includes(upper)) intent = 'termin_bestaetigung_ja'
  else if (['NEIN', 'NEIN DANKE', 'NEINN'].includes(upper)) intent = 'termin_bestaetigung_nein'
  else if (upper.includes('VERSCHIEBEN') || upper.includes('UMTERMIN') || upper.includes('ANDEREN TERMIN')) intent = 'umtermin'

  // Insert
  const { data: inbound } = await db
    .from('whatsapp_inbound_messages')
    .insert({
      twilio_message_sid: messageSid,
      from_phone: fromPhone,
      to_phone: toPhone,
      body: messageBody,
      media_urls: mediaUrls.length > 0 ? mediaUrls : null,
      num_media: numMedia,
      matched_lead_id: matchedLeadId,
      matched_fall_id: matchedFallId,
      matched_termin_id: matchedTerminId,
      intent,
      raw_payload: body,
    })
    .select('id')
    .single()

  // Intent-Aktionen
  if (matchedFallId && intent === 'termin_bestaetigung_ja' && matchedTerminId) {
    await db.from('gutachter_termine')
      .update({ status: 'bestaetigt' })
      .eq('id', matchedTerminId)
      .in('status', ['reserviert', 'angefragt'])

    await db.from('timeline').insert({
      fall_id: matchedFallId,
      typ: 'whatsapp-inbound',
      titel: 'Kunde hat Termin bestaetigt (WhatsApp)',
      beschreibung: messageBody,
    })

    await sendCommunication('chat_fallback_kunde', {
      telefon: fromPhone,
      '1': '',
      '2': 'Vielen Dank! Wir haben Ihre Bestaetigung erhalten. Bis bald.',
    }).catch(() => {})
  }

  if (matchedFallId && (intent === 'termin_bestaetigung_nein' || intent === 'umtermin')) {
    const { data: fall } = await db.from('faelle').select('kundenbetreuer_id, fall_nummer').eq('id', matchedFallId).single()
    if (fall?.kundenbetreuer_id) {
      const { createNotification } = await import('@/lib/notifications')
      await createNotification(
        fall.kundenbetreuer_id,
        'kunde-termin-abgelehnt',
        `Kunde lehnt Termin ab: Fall ${fall.fall_nummer ?? matchedFallId.slice(0, 8)}`,
        `WhatsApp-Antwort: "${messageBody}". Bitte Kunde fuer neuen Termin kontaktieren.`,
        `/admin/faelle/${matchedFallId}`,
      ).catch(() => {})
    }
    await sendCommunication('chat_fallback_kunde', {
      telefon: fromPhone,
      '1': '',
      '2': 'Verstanden. Wir melden uns kurz fuer einen neuen Terminvorschlag.',
    }).catch(() => {})
  }

  if (matchedFallId && intent === 'dokument_upload' && mediaUrls.length > 0) {
    for (const url of mediaUrls) {
      await db.from('fall_dokumente').insert({
        fall_id: matchedFallId,
        typ: 'whatsapp-foto',
        kategorie: 'whatsapp-foto',
        datei_url: url,
        datei_name: `WhatsApp-Foto-${Date.now()}.jpg`,
        quelle: 'whatsapp-inbound',
        sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
      })
    }

    const { data: fall } = await db.from('faelle').select('kundenbetreuer_id, fall_nummer').eq('id', matchedFallId).single()
    if (fall?.kundenbetreuer_id) {
      const { createNotification } = await import('@/lib/notifications')
      await createNotification(
        fall.kundenbetreuer_id,
        'kunde-dokument-upload',
        `Kunde hat ${mediaUrls.length} Dokument(e) gesendet: Fall ${fall.fall_nummer ?? matchedFallId.slice(0, 8)}`,
        'Per WhatsApp eingegangen. Bitte pruefen.',
        `/admin/faelle/${matchedFallId}?tab=dokumente`,
      ).catch(() => {})
    }

    await sendCommunication('chat_fallback_kunde', {
      telefon: fromPhone,
      '1': '',
      '2': `Vielen Dank! Wir haben ${mediaUrls.length} Datei(en) erhalten.`,
    }).catch(() => {})
  }

  // Mark processed
  if (inbound?.id) {
    await db.from('whatsapp_inbound_messages').update({
      processed: true,
      processed_at: new Date().toISOString(),
    }).eq('id', inbound.id)
  }

  return new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } })
}
