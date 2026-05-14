'use server'

// AAR-296: Token-basierte ZB1-Upload-Action für /upload/zb1/[token]-Page.
// Validiert Token + Expiry, lädt Bild in Storage, ruft OCR-Parser auf,
// schreibt Ergebnis (nur leere Felder, H6-Regel) in leads.

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ZB1ExtractedData } from '@/lib/ocr/zb1-parser'
import { getStorageUrl } from '@/lib/storage/url'

export type ZB1UploadResult = {
  success: boolean
  error?: string
  // Nur die wichtigsten OCR-Felder zur Anzeige auf der Erfolgs-Seite
  extracted?: {
    kennzeichen?: string | null
    fahrzeug_hersteller?: string | null
    fahrzeug_modell?: string | null
    halter_name?: string | null
  }
}

export async function uploadZb1ViaToken(
  token: string,
  imageBase64: string,
  contentType: string = 'image/jpeg',
): Promise<ZB1UploadResult> {
  const db = createAdminClient()

  if (!token || token.length < 16) {
    return { success: false, error: 'Ungültiger Token' }
  }
  if (!imageBase64 || imageBase64.length < 100) {
    return { success: false, error: 'Bild fehlt oder zu klein' }
  }

  // 1. Token validieren — Lead laden
  const { data: lead } = await db
    .from('leads')
    .select('id, vorname, nachname, zugewiesen_an, zb1_status, zb1_token_expires_at, zb1_upload_versuche, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, kennzeichen, fin, erstzulassung, halter_vorname, halter_nachname, halter_strasse, halter_plz, halter_stadt, hsn, tsn')
    .eq('zb1_token', token)
    .maybeSingle()

  if (!lead) return { success: false, error: 'Token nicht gefunden' }
  if (lead.zb1_status === 'hochgeladen') {
    return { success: false, error: 'Foto wurde bereits empfangen' }
  }
  if (lead.zb1_token_expires_at && new Date(lead.zb1_token_expires_at).getTime() < Date.now()) {
    return { success: false, error: 'Link ist abgelaufen' }
  }

  // 2. Bild → Storage
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  const ts = Date.now()
  const path = `leads/${lead.id}/zb1_${ts}.${ext}`
  const buf = Buffer.from(imageBase64, 'base64')
  const { error: upErr } = await db.storage
    .from('fall-dokumente')
    .upload(path, buf, { contentType, upsert: false })
  if (upErr) {
    await db.from('leads').update({
      zb1_upload_versuche: (lead.zb1_upload_versuche ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id)
    return { success: false, error: `Upload fehlgeschlagen: ${upErr.message}` }
  }
  const publicUrl = await getStorageUrl(db, 'fall-dokumente', path)
  if (!publicUrl) return { success: false, error: 'URL-Generierung fehlgeschlagen' }

  // 3. OCR aufrufen — AAR-350: mit try/catch damit Storage-Upload nicht
  // verloren geht, wenn die Vision API wirft (DNS, Timeout, API disabled).
  // Ohne Wrapper crasht die gesamte Server-Action und der User sieht nur
  // einen generischen 500er, während `zb1_status` auf 'gesendet' stehen bleibt.
  let ocrResult:
    | { fullText: string; extracted: ZB1ExtractedData }
    | { error: string; status?: number }
  try {
    const { runZB1Ocr } = await import('@/lib/ocr/zb1-parser')
    ocrResult = await runZB1Ocr(imageBase64)
  } catch (err) {
    console.error(
      '[AAR-350] ZB1 OCR CRASH (unhandled):',
      err instanceof Error ? err.message : err,
      err instanceof Error ? err.stack : undefined,
    )
    // Foto bleibt in Storage, Status auf fehlgeschlagen — KB prüft manuell
    await db.from('leads').update({
      zb1_status: 'fehlgeschlagen',
      zb1_url: publicUrl,
      zb1_upload_versuche: (lead.zb1_upload_versuche ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id)

    if (lead.zugewiesen_an) {
      try {
        const { createNotification } = await import('@/lib/notifications')
        await createNotification(
          lead.zugewiesen_an,
          'zb1-fehlgeschlagen',
          `ZB1-OCR abgestürzt: ${lead.vorname ?? 'Lead'} ${lead.nachname ?? ''}`.trim(),
          'Foto angekommen, OCR-Service nicht erreichbar — manuell prüfen.',
          `/dispatch/leads/${lead.id}`,
        )
      } catch { /* non-critical */ }
    }
    return {
      success: false,
      error: `OCR-Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`,
    }
  }

  if ('error' in ocrResult) {
    // AAR-339: Konkreten OCR-Fehler loggen damit Aaron in Vercel-Logs sieht
    // ob Google-Vision-Key fehlt / abgelaufen / falsches Projekt. User-Meldung
    // bleibt generisch, der Fehlergrund steht im Log.
    console.error(
      '[AAR-339/AAR-296] ZB1 OCR fehlgeschlagen:',
      ocrResult.error,
      'status:',
      'status' in ocrResult ? ocrResult.status : 'unknown',
    )
    // Bild bleibt in Storage erhalten, MA sieht es manuell
    await db.from('leads').update({
      zb1_status: 'fehlgeschlagen',
      zb1_url: publicUrl,
      zb1_upload_versuche: (lead.zb1_upload_versuche ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id)

    if (lead.zugewiesen_an) {
      try {
        const { createNotification } = await import('@/lib/notifications')
        await createNotification(
          lead.zugewiesen_an,
          'zb1-fehlgeschlagen',
          `ZB1-OCR fehlgeschlagen: ${lead.vorname ?? 'Lead'} ${lead.nachname ?? ''}`.trim(),
          'Foto ist angekommen, Auslesen fehlgeschlagen — manuell prüfen.',
          `/dispatch/leads/${lead.id}`,
        )
      } catch { /* non-critical */ }
    }
    return { success: false, error: 'Daten konnten nicht ausgelesen werden — bitte erneut versuchen' }
  }

  // 4. OCR-Ergebnis schreiben — H6 Konfliktregel: nur leere Felder überschreiben
  const { extracted } = ocrResult
  const leadUpdate: Record<string, unknown> = {
    zb1_status: 'hochgeladen',
    zb1_url: publicUrl,
    zb1_hochgeladen_am: new Date().toISOString(),
    zb1_ocr_daten: { raw_text: ocrResult.fullText, extracted, ts: new Date().toISOString() },
    zb1_upload_versuche: (lead.zb1_upload_versuche ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }

  // H6: Nur überschreiben wenn Feld noch leer
  function setIfEmpty(field: string, value: string | number | null | undefined) {
    if (value == null) return
    const current = (lead as unknown as Record<string, unknown>)[field]
    if (current == null || current === '') leadUpdate[field] = value
  }
  setIfEmpty('fin', extracted.fin_vin)
  setIfEmpty('kennzeichen', extracted.kennzeichen)
  setIfEmpty('fahrzeug_hersteller', extracted.fahrzeug_hersteller)
  setIfEmpty('fahrzeug_modell', extracted.fahrzeug_modell)
  setIfEmpty('fahrzeug_baujahr', extracted.fahrzeug_baujahr)
  setIfEmpty('erstzulassung', extracted.erstzulassung)
  setIfEmpty('halter_vorname', extracted.halter_vorname)
  setIfEmpty('halter_nachname', extracted.halter_nachname)
  setIfEmpty('halter_strasse', extracted.halter_strasse)
  setIfEmpty('halter_plz', extracted.halter_plz)
  setIfEmpty('halter_stadt', extracted.halter_stadt)
  setIfEmpty('hsn', extracted.hsn)
  setIfEmpty('tsn', extracted.tsn)
  setIfEmpty('fahrzeug_farbe', extracted.fahrzeug_farbe)
  setIfEmpty('brn', extracted.brn)

  await db.from('leads').update(leadUpdate).eq('id', lead.id)

  // 5. Cardentity-Trigger wenn FIN gefunden (non-blocking)
  if (extracted.fin_vin) {
    import('@/lib/cardentity/enrich-fahrzeug')
      .then(({ enrichLeadByFin }) => enrichLeadByFin(lead.id))
      .catch((err) => console.warn('[AAR-296] Cardentity-Trigger fehlgeschlagen:', err))
  }

  // 6. Notification an Dispatcher
  if (lead.zugewiesen_an) {
    try {
      const { createNotification } = await import('@/lib/notifications')
      await createNotification(
        lead.zugewiesen_an,
        'zb1-hochgeladen',
        `Fahrzeugschein eingegangen: ${lead.vorname ?? 'Lead'} ${lead.nachname ?? ''}`.trim(),
        `Foto via Web-Upload empfangen, OCR-Daten gefüllt.`,
        `/dispatch/leads/${lead.id}`,
      )
    } catch { /* non-critical */ }
  }

  // Timeline-Event
  await db.from('timeline').insert({
    lead_id: lead.id,
    typ: 'system',
    titel: 'Fahrzeugschein-Foto via Web-Upload eingegangen',
    beschreibung: extracted.kennzeichen
      ? `OCR erkannt: ${extracted.kennzeichen}, ${extracted.fahrzeug_hersteller ?? ''} ${extracted.fahrzeug_modell ?? ''}`.trim()
      : 'OCR-Daten gefüllt.',
  }).then(() => {}, () => {})

  // AAR-802: Lead-Update sichtbar in Dispatcher-UI
  revalidatePath(`/dispatch/leads/${lead.id}`)
  revalidatePath('/dispatch/leads')

  return {
    success: true,
    extracted: {
      kennzeichen: extracted.kennzeichen ?? null,
      fahrzeug_hersteller: extracted.fahrzeug_hersteller ?? null,
      fahrzeug_modell: extracted.fahrzeug_modell ?? null,
      halter_name: [extracted.halter_vorname, extracted.halter_nachname].filter(Boolean).join(' ') || null,
    },
  }
}

// Lookup-Funktion für die Server-Component der Upload-Page (Token-Status prüfen).
export async function getZb1TokenStatus(token: string): Promise<{
  ok: boolean
  reason?: 'invalid' | 'expired' | 'already_uploaded'
  vorname?: string | null
}> {
  if (!token || token.length < 16) return { ok: false, reason: 'invalid' }
  const db = createAdminClient()
  const { data: lead } = await db
    .from('leads')
    .select('id, vorname, zb1_status, zb1_token_expires_at')
    .eq('zb1_token', token)
    .maybeSingle()
  if (!lead) return { ok: false, reason: 'invalid' }
  if (lead.zb1_status === 'hochgeladen') return { ok: false, reason: 'already_uploaded', vorname: lead.vorname }
  if (lead.zb1_token_expires_at && new Date(lead.zb1_token_expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', vorname: lead.vorname }
  }
  return { ok: true, vorname: lead.vorname }
}
