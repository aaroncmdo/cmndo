// AAR-94: Twilio Inbound Webhook für WhatsApp-Replies (JA/NEIN/Foto/...)
// AAR-158: Media-Attachments werden downloaded + in Supabase Storage abgelegt
// + als Row in `dokumente` (quelle='whatsapp') eingetragen — damit die
// Fallakte sie im Dokumente-Tab anzeigt (nicht mehr fall_dokumente).
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

  // AAR-103: Multi-Fall-aware Matching via matchInboundToFall
  const { matchInboundToFall } = await import('@/lib/inbound/match-fall')
  const match = await matchInboundToFall(db, fromPhone)
  const matchedLeadId = match.leadId
  let matchedFallId = match.fallId
  let matchedTerminId: string | null = null

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
      titel: 'Kunde hat Termin bestätigt (WhatsApp)',
      beschreibung: messageBody,
    })

    await sendCommunication('chat_fallback_kunde', {
      telefon: fromPhone,
      '1': '',
      '2': 'Vielen Dank! Wir haben Ihre Bestätigung erhalten. Bis bald.',
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
        `WhatsApp-Antwort: "${messageBody}". Bitte Kunde für neuen Termin kontaktieren.`,
        `/admin/faelle/${matchedFallId}`,
      ).catch(() => {})
    }
    await sendCommunication('chat_fallback_kunde', {
      telefon: fromPhone,
      '1': '',
      '2': 'Verstanden. Wir melden uns kurz für einen neuen Terminvorschlag.',
    }).catch(() => {})
  }

  // AAR-158: WA-Medien in Supabase Storage + dokumente-Row (nicht mehr
  // fall_dokumente — die Fallakte liest aus `dokumente`). Media von Twilio
  // werden downloaded (Basic-Auth mit Account-SID + Auth-Token) und unter
  // Bucket `dokumente` als `{fall_id}/wa_{timestamp}_{n}.{ext}` abgelegt.
  if (matchedFallId && intent === 'dokument_upload' && mediaUrls.length > 0) {
    const twilioSid = process.env.TWILIO_ACCOUNT_SID
    const twilioToken = process.env.TWILIO_AUTH_TOKEN
    const basicAuth = twilioSid && twilioToken
      ? 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')
      : null

    const gespeichert: string[] = []
    for (let i = 0; i < mediaUrls.length; i++) {
      const url = mediaUrls[i]
      const contentType = body[`MediaContentType${i}`] ?? 'application/octet-stream'
      const ext =
        contentType === 'image/jpeg' ? 'jpg'
        : contentType === 'image/png' ? 'png'
        : contentType === 'image/webp' ? 'webp'
        : contentType === 'application/pdf' ? 'pdf'
        : contentType === 'video/mp4' ? 'mp4'
        : contentType.split('/')[1] || 'bin'

      try {
        const res = await fetch(url, basicAuth ? { headers: { Authorization: basicAuth } } : undefined)
        if (!res.ok) {
          console.warn('[AAR-158] Twilio-Media Download fehlgeschlagen:', res.status, url)
          continue
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const ts = Date.now()
        const path = `${matchedFallId}/wa_${ts}_${i}.${ext}`
        const { error: upErr } = await db.storage
          .from('dokumente')
          .upload(path, buf, { contentType, upsert: false })
        if (upErr) {
          console.warn('[AAR-158] Storage-Upload fehlgeschlagen:', upErr.message)
          continue
        }
        const { data: publicData } = db.storage.from('dokumente').getPublicUrl(path)
        const publicUrl = publicData.publicUrl

        const kategorie = contentType.startsWith('image/') ? 'whatsapp-foto' : 'kundendokument'
        await db.from('dokumente').insert({
          fall_id: matchedFallId,
          typ: contentType.startsWith('image/') ? 'whatsapp-foto' : 'whatsapp-datei',
          kategorie,
          quelle: 'whatsapp',
          datei_url: publicUrl,
          datei_name: `WhatsApp ${new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.${ext}`,
          datei_groesse: buf.byteLength,
          hochgeladen_von_rolle: 'kunde',
          sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
          beschreibung: 'Via WhatsApp eingegangen',
        })
        gespeichert.push(path)
      } catch (err) {
        console.error('[AAR-158] Media-Verarbeitung Fehler:', err)
      }
    }

    const { data: fall } = await db.from('faelle').select('kundenbetreuer_id, fall_nummer').eq('id', matchedFallId).single()
    if (fall?.kundenbetreuer_id && gespeichert.length > 0) {
      const { createNotification } = await import('@/lib/notifications')
      await createNotification(
        fall.kundenbetreuer_id,
        'kunde-dokument-upload',
        `Kunde hat ${gespeichert.length} Dokument(e) gesendet: Fall ${fall.fall_nummer ?? matchedFallId.slice(0, 8)}`,
        'Per WhatsApp eingegangen. Bitte prüfen.',
        `/admin/faelle/${matchedFallId}?tab=dokumente`,
      ).catch(() => {})
    }

    try {
      await db.from('timeline').insert({
        fall_id: matchedFallId,
        typ: 'whatsapp-inbound',
        titel: `${gespeichert.length} Datei(en) per WhatsApp empfangen`,
        beschreibung: gespeichert.length > 0
          ? `Abgelegt in Dokumente-Tab. ${mediaUrls.length - gespeichert.length} Datei(en) fehlgeschlagen.`
          : 'Download/Storage-Upload fehlgeschlagen — siehe Server-Log',
      })
    } catch {
      // Timeline-Insert ist non-critical — Haupt-Flow nicht blockieren
    }

    await sendCommunication('chat_fallback_kunde', {
      telefon: fromPhone,
      '1': '',
      '2': `Vielen Dank! Wir haben ${gespeichert.length} Datei(en) erhalten.`,
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
