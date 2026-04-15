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

  // AAR-182: Lead-Pfad — ZB1-Upload-Anfrage. Wenn der Lead noch kein Fall
  // ist aber zb1_status='gesendet' hat und Media kommt, interpretieren wir
  // das erste Foto als Fahrzeugschein, schieben es in Storage, rufen den
  // Parser direkt auf und schreiben extrahierte Felder auf den Lead. Das
  // muss VOR dem Fall-Pfad stehen damit wir nicht den falschen Zweig gehen.
  if (
    matchedLeadId && !matchedFallId &&
    intent === 'dokument_upload' && mediaUrls.length > 0
  ) {
    try {
      const { data: leadRow } = await db
        .from('leads')
        .select('id, vorname, zb1_status, zugewiesen_an')
        .eq('id', matchedLeadId)
        .single()
      if (leadRow?.zb1_status === 'gesendet' || leadRow?.zb1_status === 'geoeffnet') {
        const twilioSid = process.env.TWILIO_ACCOUNT_SID
        const twilioToken = process.env.TWILIO_AUTH_TOKEN
        const basicAuth = twilioSid && twilioToken
          ? 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')
          : null

        // Nur das erste Bild-Attachment als ZB1 nehmen — der Kunde schickt
        // manchmal 2 Fotos (Vor-/Rück), wir werten hier die Vorderseite aus.
        const firstImageIdx = mediaUrls.findIndex((_url, i) => {
          const ct = body[`MediaContentType${i}`] ?? ''
          return ct.startsWith('image/')
        })
        const url = firstImageIdx >= 0 ? mediaUrls[firstImageIdx] : mediaUrls[0]
        const contentType = body[`MediaContentType${firstImageIdx >= 0 ? firstImageIdx : 0}`] ?? 'image/jpeg'
        const ext =
          contentType === 'image/png' ? 'png'
          : contentType === 'image/webp' ? 'webp'
          : 'jpg'

        const res = await fetch(url, basicAuth ? { headers: { Authorization: basicAuth } } : undefined)
        if (!res.ok) {
          await db.from('leads').update({
            zb1_status: 'fehlgeschlagen',
            updated_at: new Date().toISOString(),
          }).eq('id', matchedLeadId)
          console.warn('[AAR-182] Twilio-Media Download fehlgeschlagen:', res.status)
        } else {
          const buf = Buffer.from(await res.arrayBuffer())
          const ts = Date.now()
          const path = `leads/${matchedLeadId}/zb1_${ts}.${ext}`
          const { error: upErr } = await db.storage
            .from('dokumente')
            .upload(path, buf, { contentType, upsert: false })
          if (upErr) {
            console.warn('[AAR-182] Storage-Upload fehlgeschlagen:', upErr.message)
          } else {
            const { data: publicData } = db.storage.from('dokumente').getPublicUrl(path)
            const publicUrl = publicData.publicUrl

            // OCR direkt aus dem Buffer laufen lassen (shared parser)
            const { runZB1Ocr } = await import('@/lib/ocr/zb1-parser')
            const ocrResult = await runZB1Ocr(buf.toString('base64'))
            if ('error' in ocrResult) {
              await db.from('leads').update({
                zb1_status: 'fehlgeschlagen',
                zb1_url: publicUrl,
                updated_at: new Date().toISOString(),
              }).eq('id', matchedLeadId)
            } else {
              const { fullText, extracted } = ocrResult
              const leadUpdate: Record<string, unknown> = {
                zb1_status: 'hochgeladen',
                zb1_url: publicUrl,
                zb1_hochgeladen_am: new Date().toISOString(),
                zb1_ocr_daten: { raw_text: fullText, extracted, ts: new Date().toISOString() },
                updated_at: new Date().toISOString(),
              }
              // AAR-208 Bug 1: FIN wurde vorher NICHT geschrieben — jetzt
              // in leads.fin (Spalten-Name ist 'fin' auf leads, 'fin_vin' auf
              // faelle — enrich-fahrzeug.ts kennt beide Varianten).
              if (extracted.fin_vin) leadUpdate.fin = extracted.fin_vin
              if (extracted.kennzeichen) leadUpdate.kennzeichen = extracted.kennzeichen
              if (extracted.fahrzeug_hersteller) leadUpdate.fahrzeug_hersteller = extracted.fahrzeug_hersteller
              if (extracted.fahrzeug_modell) leadUpdate.fahrzeug_modell = extracted.fahrzeug_modell
              if (extracted.fahrzeug_baujahr != null) leadUpdate.fahrzeug_baujahr = extracted.fahrzeug_baujahr
              if (extracted.erstzulassung) leadUpdate.erstzulassung = extracted.erstzulassung
              if (extracted.halter_vorname) leadUpdate.halter_vorname = extracted.halter_vorname
              if (extracted.halter_nachname) leadUpdate.halter_nachname = extracted.halter_nachname
              if (extracted.halter_strasse) leadUpdate.halter_strasse = extracted.halter_strasse
              if (extracted.halter_plz) leadUpdate.halter_plz = extracted.halter_plz
              if (extracted.halter_stadt) leadUpdate.halter_stadt = extracted.halter_stadt
              // AAR-208: HSN/TSN aus OCR (Migration aar208_leads_hsn_tsn)
              if (extracted.hsn) leadUpdate.hsn = extracted.hsn
              if (extracted.tsn) leadUpdate.tsn = extracted.tsn
              await db.from('leads').update(leadUpdate).eq('id', matchedLeadId)

              // AAR-208 Bug 1: Cardentity-Auto-Trigger wenn FIN gefunden —
              // Vorschaden-Check für den Lead. Non-blocking.
              if (extracted.fin_vin) {
                import('@/lib/cardentity/enrich-fahrzeug')
                  .then(({ enrichLeadByFin }) => enrichLeadByFin(matchedLeadId))
                  .catch((err) => console.warn('[AAR-208] Cardentity-Trigger fehlgeschlagen:', err))
              }
            }
          }
        }

        // WA-Bestätigung an Kunde (non-critical)
        await sendCommunication('chat_fallback_kunde', {
          telefon: fromPhone,
          '1': '',
          '2': 'Danke! Ihr Fahrzeugschein ist angekommen — wir lesen die Daten aus und der Dispatcher meldet sich.',
        }).catch(() => {})

        // Toast-Notification an Dispatcher (leadbearbeiter)
        if (leadRow.zugewiesen_an) {
          try {
            const { createNotification } = await import('@/lib/notifications')
            await createNotification(
              leadRow.zugewiesen_an,
              'zb1-hochgeladen',
              `Fahrzeugschein eingegangen: ${leadRow.vorname ?? 'Lead'}`,
              'ZB1-Foto wurde OCR-ausgelesen, Fahrzeugdaten sind gefüllt.',
              `/dispatch/leads/${matchedLeadId}`,
            )
          } catch { /* non-critical */ }
        }

        // Abbruch des generischen Dokument-Upload-Pfads (wir haben den Lead-
        // Pfad abgearbeitet). Mark processed + respond.
        if (inbound?.id) {
          await db.from('whatsapp_inbound_messages').update({
            processed: true,
            processed_at: new Date().toISOString(),
          }).eq('id', inbound.id)
        }
        return new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } })
      }
    } catch (err) {
      console.error('[AAR-182] ZB1-Lead-Pfad Fehler:', err)
    }
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
