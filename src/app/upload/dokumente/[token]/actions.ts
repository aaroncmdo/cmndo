'use server'

// AAR-352: Token-basierte Multi-Slot-Upload-Action für /upload/dokumente/[token].
// Ersetzt die Einzel-Upload-Pages (/upload/zb1, /upload/polizeibericht).
// Validiert den Token gegen dokument_upload_anfragen, lädt das Bild in Storage,
// je nach Slot:
//   - fahrzeugschein (mit ocr=true): OCR-Pipeline + H6-Konfliktregel auf leads
//   - polizeibericht: landet in fall_dokumente (falls Fall existiert) und
//     spiegelt leads.polizeibericht_* (legacy Twilio-Webhook-Kompat)
//   - sonstiges: landet in fall_dokumente mit freier Beschreibung
// Am Ende wird der Slot im JSONB-Array als hochgeladen markiert und der
// Gesamt-Status der Anfrage (teilweise/komplett) nachgezogen.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ZB1ExtractedData } from '@/lib/ocr/zb1-parser'
import { getStorageUrl } from '@/lib/storage/url'

type Slot = {
  // AAR-unfallfotos: 'unfallfotos' akzeptiert multiple Uploads (Mehr-Foto-Slot).
  slot_id:
    | 'fahrzeugschein'
    | 'polizeibericht'
    | 'unfallfotos'
    | 'sonstiges'
    | 'sachschaden_foto'
    | 'sachschaden_rechnung'
    | 'aerztliches_attest'
    | 'diagnosebericht'
    | 'zeugenaussage'
  label: string
  ocr: boolean
  hochgeladen: boolean
  doc_url: string | null
  hochgeladen_am: string | null
}

type Anfrage = {
  id: string
  lead_id: string
  token: string
  slots: Slot[]
  status: 'gesendet' | 'teilweise' | 'komplett' | 'abgelaufen'
  expires_at: string
}

export type DokumenteTokenStatus =
  | {
      ok: true
      vorname: string | null
      slots: { slot_id: Slot['slot_id']; label: string; ocr: boolean; hochgeladen: boolean }[]
    }
  | { ok: false; reason: 'invalid' | 'expired' | 'already_complete'; vorname?: string | null }

export async function getDokumenteAnfrageStatus(token: string): Promise<DokumenteTokenStatus> {
  if (!token || token.length < 16) return { ok: false, reason: 'invalid' }
  const db = createAdminClient()
  const { data: anfrage } = await db
    .from('dokument_upload_anfragen')
    .select('id, lead_id, slots, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!anfrage) return { ok: false, reason: 'invalid' }

  const { data: lead } = await db
    .from('leads')
    .select('vorname')
    .eq('id', anfrage.lead_id)
    .maybeSingle()
  const vorname = (lead?.vorname as string | null) ?? null

  if (anfrage.status === 'komplett') return { ok: false, reason: 'already_complete', vorname }
  if (anfrage.expires_at && new Date(anfrage.expires_at as string).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', vorname }
  }

  const slots = (anfrage.slots as Slot[]).map((s) => ({
    slot_id: s.slot_id,
    label: s.label,
    ocr: s.ocr,
    hochgeladen: s.hochgeladen,
  }))
  return { ok: true, vorname, slots }
}

export type DokumentUploadResult = {
  success: boolean
  error?: string
  // Nur bei fahrzeugschein mit OCR gesetzt — Rückmeldung an Kunde
  extracted?: {
    kennzeichen?: string | null
    fahrzeug_hersteller?: string | null
    fahrzeug_modell?: string | null
    halter_name?: string | null
  }
  // True wenn mit diesem Upload alle Slots befüllt sind
  alle_hochgeladen?: boolean
}

export async function uploadDokumentViaAnfrageToken(
  token: string,
  slotId: Slot['slot_id'],
  imageBase64: string,
  contentType: string = 'image/jpeg',
): Promise<DokumentUploadResult> {
  if (!token || token.length < 16) return { success: false, error: 'Ungültiger Token' }
  if (!imageBase64 || imageBase64.length < 100) {
    return { success: false, error: 'Bild fehlt oder zu klein' }
  }

  const db = createAdminClient()

  // 1. Anfrage laden + validieren
  const { data: anfrageRow } = await db
    .from('dokument_upload_anfragen')
    .select('id, lead_id, token, slots, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!anfrageRow) return { success: false, error: 'Token nicht gefunden' }
  const anfrage = anfrageRow as unknown as Anfrage

  if (anfrage.status === 'komplett') {
    return { success: false, error: 'Alle Dokumente wurden bereits empfangen' }
  }
  if (anfrage.expires_at && new Date(anfrage.expires_at).getTime() < Date.now()) {
    return { success: false, error: 'Link ist abgelaufen' }
  }

  const slotIdx = anfrage.slots.findIndex((s) => s.slot_id === slotId)
  if (slotIdx === -1) return { success: false, error: `Slot ${slotId} nicht in dieser Anfrage` }
  const slot = anfrage.slots[slotIdx]
  // AAR-unfallfotos: Multi-File-Slot — weitere Fotos werden angehängt.
  // AAR-zb1-wizard: fahrzeugschein erlaubt Mehrfach-Upload, damit der
  // Kunde im Wizard "Neu fotografieren" klicken kann nach OCR-Fehler
  // oder bei sichtbar falsch ausgelesenen Werten.
  // Andere Single-Slots (polizeibericht/sonstiges/…) bleiben blockiert.
  const erlaubtMehrfach = slotId === 'unfallfotos' || slotId === 'fahrzeugschein'
  if (slot.hochgeladen && !erlaubtMehrfach) {
    return { success: false, error: 'Dieses Dokument wurde bereits empfangen' }
  }

  // 2. Bild → Storage
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  const ts = Date.now()
  const path = `leads/${anfrage.lead_id}/${slotId}_${ts}.${ext}`
  const buf = Buffer.from(imageBase64, 'base64')
  const { error: upErr } = await db.storage
    .from('fall-dokumente')
    .upload(path, buf, { contentType, upsert: false })
  if (upErr) return { success: false, error: `Upload fehlgeschlagen: ${upErr.message}` }
  const publicUrl = await getStorageUrl(db, 'fall-dokumente', path)
  if (!publicUrl) return { success: false, error: 'URL-Generierung fehlgeschlagen' }

  // 3. Zugehörigen Fall finden (falls vorhanden — für fall_dokumente-Insert)
  const { data: fallRow } = await db
    .from('faelle')
    .select('id')
    .eq('lead_id', anfrage.lead_id)
    .limit(1)
    .maybeSingle()
  const fallId = (fallRow?.id as string | null) ?? null

  // 4. Slot-spezifische Logik
  let extracted: DokumentUploadResult['extracted'] = undefined

  if (slotId === 'fahrzeugschein' && slot.ocr) {
    // OCR-Pipeline + leads-Update (H6-Regel)
    const ocrRes = await runZb1OcrAndUpdate(db, anfrage.lead_id, imageBase64, publicUrl)
    if (!ocrRes.success) {
      // Bild bleibt in Storage, Slot trotzdem als hochgeladen markieren wäre falsch.
      // Wir markieren NICHT als hochgeladen — User sieht Fehler und kann neu versuchen.
      return { success: false, error: ocrRes.error }
    }
    extracted = ocrRes.extracted
  } else if (slotId === 'fahrzeugschein' && !slot.ocr) {
    // Fahrzeugschein ohne OCR — nur speichern, kein leads-Update
    await insertFallDokument(db, fallId, slotId, path, contentType, buf.length, slot.label)
    await mirrorFahrzeugscheinOhneOcr(db, anfrage.lead_id, publicUrl)
  } else if (slotId === 'polizeibericht') {
    await insertFallDokument(db, fallId, 'polizeibericht', path, contentType, buf.length, slot.label)
    // Legacy-Felder aktualisieren damit alte Queries (Pflicht-Check) weiter funktionieren
    await db.from('leads').update({
      polizeibericht_status: 'hochgeladen',
      polizeibericht_url: publicUrl,
      polizeibericht_hochgeladen_am: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', anfrage.lead_id)
    // AAR-504: Auto-OCR via after() — läuft garantiert nach Response-Send.
    const { scheduleBkatAnalyseAfterUpload } = await import('@/lib/bkat/auto-trigger')
    scheduleBkatAnalyseAfterUpload(db, anfrage.lead_id, publicUrl)
  } else if (slotId === 'unfallfotos') {
    // AAR-unfallfotos: Foto landet in fall_dokumente (typ=schadensfotos —
    // matcht den bestehenden Dokument-Katalog-Slot, siehe
    // src/lib/dokumente/sichtbarkeit.ts) + URL wird ans jsonb-Array
    // leads.schadensfoto_urls angehängt. Nach jedem Upload läuft Haiku-Vision
    // async und aktualisiert leads.sachschaden_beschreibung. Wenn der Fall
    // noch nicht existiert (Dispatch-Phase), wird der fall_dokumente-Insert
    // in convertLeadToFall nachgezogen.
    await insertFallDokument(db, fallId, 'schadensfotos', path, contentType, buf.length, slot.label)
    try {
      const { appendUnfallfotoAndAnalyze } = await import('@/lib/ai/vision/analyze-unfallfotos')
      // Fire-and-forget — Analyse-Fehler darf den Upload nicht blockieren.
      appendUnfallfotoAndAnalyze(anfrage.lead_id, publicUrl).catch((err) =>
        console.error('[AAR-unfallfotos] Haiku-Vision-Analyse fehlgeschlagen:', err),
      )
    } catch (err) {
      console.error('[AAR-unfallfotos] analyze-unfallfotos Modul-Load-Fehler:', err)
    }
  } else if (slotId === 'sachschaden_foto') {
    await insertFallDokument(db, fallId, 'sachschaden_foto', path, contentType, buf.length, slot.label)
  } else if (slotId === 'sachschaden_rechnung') {
    await insertFallDokument(db, fallId, 'sachschaden_rechnung', path, contentType, buf.length, slot.label)
  } else if (slotId === 'aerztliches_attest') {
    await insertFallDokument(db, fallId, 'aerztliches_attest', path, contentType, buf.length, slot.label)
  } else if (slotId === 'diagnosebericht') {
    await insertFallDokument(db, fallId, 'diagnosebericht', path, contentType, buf.length, slot.label)
  } else if (slotId === 'zeugenaussage') {
    await insertFallDokument(db, fallId, 'zeugenaussage', path, contentType, buf.length, slot.label)
  } else {
    // sonstiges → fall_dokumente ohne Slot-Mapping (KB ordnet manuell zu)
    await insertFallDokument(db, fallId, 'kunde-nachreichung', path, contentType, buf.length, slot.label)
  }

  // 4b. Pflichtdokument-Sync (non-critical) — Wenn für diesen Fall bereits
  //     eine pflichtdokumente-Row existiert (z.B. nach SA-Abschluss via
  //     Schritt 11 in convert-lead-to-claim), wird sie auf 'hochgeladen' gesetzt.
  if (fallId && (slotId === 'fahrzeugschein' || slotId === 'polizeibericht')) {
    try {
      await syncPflichtdokument(db, fallId, slotId, publicUrl)
    } catch (err) {
      console.error('[pflichtdokument-sync] Fehler beim Syncing:', err)
    }
  }

  // 5. Slot im JSONB-Array auf hochgeladen=true
  const now = new Date().toISOString()
  const updatedSlots = anfrage.slots.map((s, i) =>
    i === slotIdx ? { ...s, hochgeladen: true, doc_url: publicUrl, hochgeladen_am: now } : s,
  )
  const alleHochgeladen = updatedSlots.every((s) => s.hochgeladen)
  const neuerStatus = alleHochgeladen ? 'komplett' : 'teilweise'

  await db
    .from('dokument_upload_anfragen')
    .update({ slots: updatedSlots, status: neuerStatus, updated_at: now })
    .eq('id', anfrage.id)

  // 6. Timeline-Eintrag
  await db.from('timeline').insert({
    lead_id: anfrage.lead_id,
    typ: 'system',
    titel: `Dokument eingegangen: ${slot.label}`,
    beschreibung: alleHochgeladen
      ? 'Alle angefragten Dokumente sind jetzt hochgeladen.'
      : `Via Web-Upload empfangen (${updatedSlots.filter((s) => s.hochgeladen).length}/${updatedSlots.length}).`,
  }).then(() => {}, () => {})

  // 7. Notification an zugewiesenen Dispatcher/KB
  const { data: leadNotif } = await db
    .from('leads')
    .select('vorname, nachname, zugewiesen_an')
    .eq('id', anfrage.lead_id)
    .maybeSingle()
  if (leadNotif?.zugewiesen_an) {
    try {
      const { createNotification } = await import('@/lib/notifications')
      await createNotification(
        leadNotif.zugewiesen_an as string,
        'dokument-hochgeladen',
        `Dokument eingegangen: ${(leadNotif.vorname as string | null) ?? 'Lead'} ${(leadNotif.nachname as string | null) ?? ''}`.trim(),
        `${slot.label} via Web-Upload empfangen${alleHochgeladen ? ' — Anfrage komplett.' : '.'}`,
        `/dispatch/leads/${anfrage.lead_id}`,
      )
    } catch { /* non-critical */ }
  }

  revalidatePath(`/dispatch/leads/${anfrage.lead_id}`)
  return { success: true, extracted, alle_hochgeladen: alleHochgeladen }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type AdminDb = ReturnType<typeof createAdminClient>

async function syncPflichtdokument(
  db: AdminDb,
  fallId: string,
  dokumentTyp: string,
  dateiUrl: string,
): Promise<void> {
  const { data: pd } = await db
    .from('pflichtdokumente')
    .select('id')
    .eq('fall_id', fallId)
    .eq('dokument_typ', dokumentTyp)
    .neq('status', 'hochgeladen')
    .maybeSingle()
  if (!pd) return
  await db
    .from('pflichtdokumente')
    .update({
      status: 'hochgeladen',
      datei_url: dateiUrl,
      hochgeladen_am: new Date().toISOString(),
    })
    .eq('id', pd.id)
}

async function insertFallDokument(
  db: AdminDb,
  fallId: string | null,
  dokumentTyp: string,
  storagePath: string,
  contentType: string,
  groesse: number,
  label: string,
): Promise<void> {
  if (!fallId) return  // Kein Fall (noch in Dispatch-Phase) → nur leads-Mirror reicht
  await db.from('fall_dokumente').insert({
    fall_id: fallId,
    dokument_typ: dokumentTyp,
    storage_path: storagePath,
    original_filename: `${dokumentTyp}_upload`,
    mime_type: contentType,
    groesse_bytes: groesse,
    uploaded_by_kunde: true,
    beschreibung: label,
    hochgeladen_am: new Date().toISOString(),
  })
}

async function mirrorFahrzeugscheinOhneOcr(
  db: AdminDb,
  leadId: string,
  publicUrl: string,
): Promise<void> {
  // Wenn fahrzeugschein ohne OCR hochgeladen wurde (Fremdfahrzeug etc.), setzen
  // wir zb1_status nicht — sonst glaubt der Twilio-Webhook es wäre schon alles
  // erledigt. Nur die URL spiegeln für KB-Ansicht.
  await db.from('leads').update({
    zb1_url: publicUrl,
    zb1_hochgeladen_am: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', leadId)
}

async function runZb1OcrAndUpdate(
  db: AdminDb,
  leadId: string,
  imageBase64: string,
  publicUrl: string,
): Promise<{ success: boolean; error?: string; extracted?: DokumentUploadResult['extracted'] }> {
  const { data: lead } = await db
    .from('leads')
    .select('id, zugewiesen_an, zb1_upload_versuche, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, kennzeichen, fin, erstzulassung, halter_vorname, halter_nachname, halter_strasse, halter_plz, halter_stadt, hsn, tsn, vorname, nachname, ist_fahrzeughalter, kunde_strasse, kunde_plz, kunde_stadt')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  // OCR mit try/catch — wenn Vision API crasht, bleibt das Bild in Storage
  let ocrResult:
    | { fullText: string; extracted: ZB1ExtractedData }
    | { error: string; status?: number }
  try {
    const { runZB1Ocr } = await import('@/lib/ocr/zb1-parser')
    ocrResult = await runZB1Ocr(imageBase64)
  } catch (err) {
    console.error('[AAR-352] ZB1 OCR CRASH:', err instanceof Error ? err.message : err)
    await db.from('leads').update({
      zb1_status: 'fehlgeschlagen',
      zb1_url: publicUrl,
      zb1_upload_versuche: ((lead.zb1_upload_versuche as number | null) ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', leadId)
    return {
      success: false,
      error: `OCR-Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`,
    }
  }

  if ('error' in ocrResult) {
    console.error('[AAR-352] ZB1 OCR fehlgeschlagen:', ocrResult.error)
    await db.from('leads').update({
      zb1_status: 'fehlgeschlagen',
      zb1_url: publicUrl,
      zb1_upload_versuche: ((lead.zb1_upload_versuche as number | null) ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', leadId)
    return { success: false, error: 'Daten konnten nicht ausgelesen werden — bitte erneut versuchen' }
  }

  // H6: Nur leere Felder überschreiben
  const { extracted } = ocrResult
  const leadUpdate: Record<string, unknown> = {
    zb1_status: 'hochgeladen',
    zb1_url: publicUrl,
    zb1_hochgeladen_am: new Date().toISOString(),
    zb1_ocr_daten: { raw_text: ocrResult.fullText, extracted, ts: new Date().toISOString() },
    zb1_upload_versuche: ((lead.zb1_upload_versuche as number | null) ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }
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

  // AAR-666: Auto-Match Halter ↔ Kunde nach OCR.
  // Wenn der Fahrzeugschein einen Namen liefert, der nach Trim/Case-Insensitive
  // mit dem Lead-Namen übereinstimmt, setzen wir `ist_fahrzeughalter=true`
  // automatisch. Der Dispatcher muss den Toggle dann nicht mehr manuell klicken
  // und die UI springt sofort auf den „Gleich wie Kunde"-Zustand.
  //
  // Wenn die Namen unterschiedlich sind, bleibt `ist_fahrzeughalter` unverändert —
  // UI zeigt dann eine Abweichungs-Warnung (siehe Phase4Stammdaten).
  const norm = (s: string | null | undefined): string =>
    (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const effektiverHalterVorname = norm(
    (leadUpdate.halter_vorname as string | undefined) ??
      (extracted.halter_vorname as string | null) ??
      (lead.halter_vorname as string | null),
  )
  const effektiverHalterNachname = norm(
    (leadUpdate.halter_nachname as string | undefined) ??
      (extracted.halter_nachname as string | null) ??
      (lead.halter_nachname as string | null),
  )
  const leadVorname = norm(lead.vorname as string | null)
  const leadNachname = norm(lead.nachname as string | null)
  const halterHeisstWieLead =
    !!leadNachname &&
    !!effektiverHalterNachname &&
    leadNachname === effektiverHalterNachname &&
    // Vorname ist tolerant: exakt gleich ODER einer von beiden leer/initial
    (!leadVorname || !effektiverHalterVorname || leadVorname === effektiverHalterVorname)
  if (halterHeisstWieLead && lead.ist_fahrzeughalter !== true) {
    leadUpdate.ist_fahrzeughalter = true
  }

  await db.from('leads').update(leadUpdate).eq('id', leadId)

  // Cardentity-Enrich non-blocking
  if (extracted.fin_vin) {
    import('@/lib/cardentity/enrich-fahrzeug')
      .then(({ enrichLeadByFin }) => enrichLeadByFin(leadId))
      .catch((err) => console.warn('[AAR-352] Cardentity-Trigger fehlgeschlagen:', err))
  }

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
