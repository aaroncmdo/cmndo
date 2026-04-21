// AAR-94: Twilio Inbound Webhook für WhatsApp-Replies (JA/NEIN/Foto/...)
// AAR-158: Media-Attachments werden downloaded + in Supabase Storage abgelegt
// + als Row in `fall_dokumente` (quelle='whatsapp') eingetragen — damit
// die Fallakte sie im Dokumente-Tab anzeigt. (AAR-553)
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

// AAR-352: Synchronisiert einen eingehenden WA-Upload mit der neuen
// dokument_upload_anfragen-Tabelle. Der Kunde kann auf die Anfrage entweder
// über den Web-Upload-Link oder per WA-Foto antworten — beide Pfade müssen
// dieselbe JSONB-Slot-Liste aktualisieren, sonst erscheint der Dispatch-
// Status als "offen" obwohl das Foto via WA eingegangen ist.
type AnfrageSlot = {
  slot_id: 'fahrzeugschein' | 'polizeibericht' | 'sonstiges'
  label: string
  ocr: boolean
  hochgeladen: boolean
  doc_url: string | null
  hochgeladen_am: string | null
}
async function syncDokumentUploadAnfrage(
  db: ReturnType<typeof createAdminClient>,
  leadId: string,
  slotId: AnfrageSlot['slot_id'],
  publicUrl: string,
): Promise<void> {
  try {
    const { data: anfragen } = await db
      .from('dokument_upload_anfragen')
      .select('id, slots, status, expires_at')
      .eq('lead_id', leadId)
      .in('status', ['gesendet', 'teilweise'])
      .order('erstellt_am', { ascending: false })
      .limit(5)
    if (!anfragen || anfragen.length === 0) return
    const now = Date.now()
    const offene = anfragen.filter((a) => {
      if (!a.expires_at) return true
      return new Date(a.expires_at as string).getTime() >= now
    })
    for (const a of offene) {
      const slots = (a.slots as AnfrageSlot[]) ?? []
      const idx = slots.findIndex((s) => s.slot_id === slotId && !s.hochgeladen)
      if (idx === -1) continue
      const tsIso = new Date().toISOString()
      const updated = slots.map((s, i) =>
        i === idx ? { ...s, hochgeladen: true, doc_url: publicUrl, hochgeladen_am: tsIso } : s,
      )
      const alle = updated.every((s) => s.hochgeladen)
      await db.from('dokument_upload_anfragen').update({
        slots: updated,
        status: alle ? 'komplett' : 'teilweise',
        updated_at: tsIso,
      }).eq('id', a.id as string)
      return  // Nur die erste passende Anfrage aktualisieren
    }
  } catch (err) {
    console.warn('[AAR-352] syncDokumentUploadAnfrage failed:', err instanceof Error ? err.message : err)
  }
}

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
  const matchedFallId = match.fallId
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
        `/faelle/${matchedFallId}`,
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
        .select('id, vorname, nachname, zb1_status, zb1_gesendet_am, polizeibericht_status, polizeibericht_gesendet_am, polizei_aktenzeichen, zugewiesen_an')
        .eq('id', matchedLeadId)
        .single()

      // AAR-263: Prio-Logik — wenn beide Anfragen offen, nimm die JÜNGERE.
      // Ohne dieses Routing würde jedes neue Foto fälschlich als ZB1
      // interpretiert (alter Pfad-Default).
      const zb1Open = leadRow?.zb1_status === 'gesendet' || leadRow?.zb1_status === 'geoeffnet'
      const pbOpen = leadRow?.polizeibericht_status === 'gesendet' || leadRow?.polizeibericht_status === 'geoeffnet'
      let route: 'zb1' | 'polizeibericht' | null = null
      if (zb1Open && pbOpen) {
        const zb1Ts = leadRow?.zb1_gesendet_am ? new Date(leadRow.zb1_gesendet_am).getTime() : 0
        const pbTs = leadRow?.polizeibericht_gesendet_am ? new Date(leadRow.polizeibericht_gesendet_am).getTime() : 0
        route = pbTs > zb1Ts ? 'polizeibericht' : 'zb1'
      } else if (zb1Open) {
        route = 'zb1'
      } else if (pbOpen) {
        route = 'polizeibericht'
      }

      // AAR-263 Audit-Fix: Mehrfachbild-Edge-Case. Wenn beide Status bereits
      // 'hochgeladen' sind und der Kunde noch ein Foto schickt (Vorder-/
      // Rückseite, weiteres Detail), würde route=null den ganzen Webhook
      // schweigend beenden + die Datei ginge verloren. Stattdessen: in
      // Storage als generischen Lead-Anhang sichern + Notification an den
      // Dispatcher (er entscheidet was es ist).
      if (!route && (leadRow?.zb1_status === 'hochgeladen' || leadRow?.polizeibericht_status === 'hochgeladen')) {
        try {
          const twilioSid = process.env.TWILIO_ACCOUNT_SID
          const twilioToken = process.env.TWILIO_AUTH_TOKEN
          const basicAuth = twilioSid && twilioToken
            ? 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')
            : null
          const savedPaths: string[] = []
          for (let i = 0; i < mediaUrls.length; i++) {
            const url = mediaUrls[i]
            const contentType = body[`MediaContentType${i}`] ?? 'image/jpeg'
            const ext =
              contentType === 'image/png' ? 'png'
              : contentType === 'image/webp' ? 'webp'
              : contentType === 'application/pdf' ? 'pdf'
              : 'jpg'
            const res = await fetch(url, basicAuth ? { headers: { Authorization: basicAuth } } : undefined)
            if (!res.ok) continue
            const buf = Buffer.from(await res.arrayBuffer())
            const ts = Date.now()
            const path = `leads/${matchedLeadId}/zusatz_${ts}_${i}.${ext}`
            const { error: upErr } = await db.storage
              .from('fall-dokumente')
              .upload(path, buf, { contentType, upsert: false })
            if (!upErr) savedPaths.push(path)
          }
          if (savedPaths.length > 0 && leadRow?.zugewiesen_an) {
            const { createNotification } = await import('@/lib/notifications')
            await createNotification(
              leadRow.zugewiesen_an,
              'lead-zusatz-foto',
              `Zusatz-Foto vom Lead: ${leadRow.vorname ?? ''} ${leadRow.nachname ?? ''}`.trim(),
              `${savedPaths.length} weitere(s) Foto(s) per WhatsApp eingegangen — bitte prüfen und manuell zuordnen.`,
              `/dispatch/leads/${matchedLeadId}`,
            ).catch(() => {})
          }
          if (inbound?.id) {
            await db.from('whatsapp_inbound_messages').update({
              processed: true,
              processed_at: new Date().toISOString(),
            }).eq('id', inbound.id)
          }
          return new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } })
        } catch (err) {
          console.error('[AAR-263] Mehrfachbild-Fallback Fehler:', err)
        }
      }

      // AAR-263: Polizeibericht-Pfad — Bild speichern, kein OCR (erstmal),
      // Status setzen, Timeline + Mitteilung. Wenn der Kunde mehrere Bilder
      // schickt, setzt das ERSTE auf 'hochgeladen', weitere kommen als
      // dokumente-Anhänge im Fall-Pfad (separates Routing).
      if (route === 'polizeibericht') {
        const twilioSid = process.env.TWILIO_ACCOUNT_SID
        const twilioToken = process.env.TWILIO_AUTH_TOKEN
        const basicAuth = twilioSid && twilioToken
          ? 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')
          : null
        const firstImageIdx = mediaUrls.findIndex((_url, i) => {
          const ct = body[`MediaContentType${i}`] ?? ''
          return ct.startsWith('image/')
        })
        const url = firstImageIdx >= 0 ? mediaUrls[firstImageIdx] : mediaUrls[0]
        const contentType = body[`MediaContentType${firstImageIdx >= 0 ? firstImageIdx : 0}`] ?? 'image/jpeg'
        const ext =
          contentType === 'image/png' ? 'png'
          : contentType === 'image/webp' ? 'webp'
          : contentType === 'application/pdf' ? 'pdf'
          : 'jpg'

        const res = await fetch(url, basicAuth ? { headers: { Authorization: basicAuth } } : undefined)
        if (!res.ok) {
          await db.from('leads').update({
            polizeibericht_status: 'fehlgeschlagen',
            updated_at: new Date().toISOString(),
          }).eq('id', matchedLeadId)
          console.warn('[AAR-263] Twilio-Media Download fehlgeschlagen:', res.status)
        } else {
          const buf = Buffer.from(await res.arrayBuffer())
          const ts = Date.now()
          const path = `leads/${matchedLeadId}/polizeibericht_${ts}.${ext}`
          const { error: upErr } = await db.storage
            .from('fall-dokumente')
            .upload(path, buf, { contentType, upsert: false })
          if (upErr) {
            await db.from('leads').update({
              polizeibericht_status: 'fehlgeschlagen',
              updated_at: new Date().toISOString(),
            }).eq('id', matchedLeadId)
            console.warn('[AAR-263] Storage-Upload fehlgeschlagen:', upErr.message)
          } else {
            const { data: publicData } = db.storage.from('fall-dokumente').getPublicUrl(path)
            const publicUrl = publicData.publicUrl
            await db.from('leads').update({
              polizeibericht_status: 'hochgeladen',
              polizeibericht_url: publicUrl,
              polizeibericht_hochgeladen_am: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', matchedLeadId)
            await syncDokumentUploadAnfrage(db, matchedLeadId, 'polizeibericht', publicUrl)
            // AAR-504: Auto-OCR nach WhatsApp-Upload — gleiche Logik wie
            // Web-Upload. Fire-and-forget, nicht blocking.
            try {
              const { triggerAutoBkatOcr } = await import('@/lib/bkat/auto-trigger')
              triggerAutoBkatOcr(db, matchedLeadId, publicUrl).catch((err) =>
                console.error('[AAR-504] auto-bkat twilio-inbound:', err),
              )
            } catch (err) {
              console.error('[AAR-504] auto-bkat module load:', err)
            }
          }
        }

        await sendCommunication('chat_fallback_kunde', {
          telefon: fromPhone,
          '1': '',
          '2': 'Danke! Die polizeiliche Unfallmitteilung ist angekommen — der Dispatcher meldet sich.',
        }).catch(() => {})

        if (leadRow?.zugewiesen_an) {
          try {
            const { createNotification } = await import('@/lib/notifications')
            await createNotification(
              leadRow.zugewiesen_an,
              'polizeibericht-hochgeladen',
              `Polizeibericht eingegangen: ${leadRow.vorname ?? 'Lead'} ${leadRow.nachname ?? ''}`.trim(),
              'Polizeiliche Unfallmitteilung wurde per WhatsApp eingereicht.',
              `/dispatch/leads/${matchedLeadId}`,
            )
          } catch { /* non-critical */ }
        }

        if (inbound?.id) {
          await db.from('whatsapp_inbound_messages').update({
            processed: true,
            processed_at: new Date().toISOString(),
          }).eq('id', inbound.id)
        }
        return new NextResponse(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } })
      }

      if (route === 'zb1') {
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
            .from('fall-dokumente')
            .upload(path, buf, { contentType, upsert: false })
          if (upErr) {
            console.warn('[AAR-182] Storage-Upload fehlgeschlagen:', upErr.message)
          } else {
            const { data: publicData } = db.storage.from('fall-dokumente').getPublicUrl(path)
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
              await syncDokumentUploadAnfrage(db, matchedLeadId, 'fahrzeugschein', publicUrl)

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
        if (leadRow?.zugewiesen_an) {
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

  // AAR-158 / AAR-553: WA-Medien in Supabase Storage + fall_dokumente-Row.
  // Media von Twilio werden downloaded (Basic-Auth mit Account-SID +
  // Auth-Token) und unter Bucket `fall-dokumente` als
  // `{fall_id}/wa_{timestamp}_{n}.{ext}` abgelegt.
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
          .from('fall-dokumente')
          .upload(path, buf, { contentType, upsert: false })
        if (upErr) {
          console.warn('[AAR-158] Storage-Upload fehlgeschlagen:', upErr.message)
          continue
        }

        const kategorie = contentType.startsWith('image/') ? 'whatsapp-foto' : 'kundendokument'
        await db.from('fall_dokumente').insert({
          fall_id: matchedFallId,
          dokument_typ: contentType.startsWith('image/') ? 'whatsapp-foto' : 'whatsapp-datei',
          kategorie,
          quelle: 'whatsapp',
          storage_path: path,
          original_filename: `WhatsApp ${new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.${ext}`,
          groesse_bytes: buf.byteLength,
          mime_type: contentType,
          uploaded_by_kunde: true,
          // AAR-263 Audit: kanzlei fehlte hier — Konsistenz mit Step 6e in
          // signSAandCreateFall (alle WhatsApp-Uploads müssen für Kanzlei
          // sichtbar sein für die Regulierung).
          sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
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
        `/faelle/${matchedFallId}?tab=dokumente`,
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
