'use server'

// AAR-163 / W3: Dokumente-Actions für die Fallakte.
// - triggerFinCallForFall: ruft Cardentity DAT/Audatex über enrichFallByFin
// - markDokumentNachgereicht: setzt nachgereicht_status auf pflichtdokumente
//   (AAR-163 Nachreichen-Flow)
// AAR-311: requestCardentityTypBForFall — manueller Typ-B-Trigger aus der
// KB-Fallakte (Admin + Kundenbetreuer dürfen).

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { RequestTypBResult } from '@/lib/cardentity/typ-b'

export async function triggerFinCallForFall(
  fallId: string,
): Promise<{ success: boolean; updatedFields?: string[]; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Rollen-Check: nur KB/Admin dürfen FIN-Call triggern
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (rolle !== 'admin' && rolle !== 'kundenbetreuer') {
    return { success: false, error: 'Nur KB/Admin dürfen FIN-Call triggern' }
  }

  const { enrichFallByFin } = await import('@/lib/cardentity/enrich-fahrzeug')
  const result = await enrichFallByFin(fallId)
  if (!result.success) return { success: false, error: result.error }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true, updatedFields: result.updatedFields }
}

/**
 * Nachreichen-Status auf einem Pflichtdokument setzen.
 * Status: 'ausstehend' (default) | 'nachgereicht_angefordert' | 'hochgeladen'
 * Der Reminder-Cron liest diese Spalte und triggert WA-Erinnerungen (W3
 * Cron-Erweiterung folgt wenn die Spalte in allen Consumer-Flows gepflegt
 * wird).
 */
export async function markDokumentNachgereicht(
  pflichtdokId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: pdok } = await supabase
    .from('pflichtdokumente')
    .select('fall_id')
    .eq('id', pflichtdokId)
    .single()
  if (!pdok) return { success: false, error: 'Pflichtdokument nicht gefunden' }

  // Das Status-Feld der Tabelle speichert den Lebenszyklus
  // (ausstehend/hochgeladen/geprueft) — wir ergänzen hier den Zwischenschritt
  // „nachgereicht_angefordert" als Text-Flag, damit die bestehenden
  // Dokumente-UI + Cron-Logik nichts brechen. Echte Migration auf eigene
  // Spalte nachgereicht_status kann folgen sobald klar ist dass mehrere
  // Stellen das Feld brauchen.
  const { error } = await supabase
    .from('pflichtdokumente')
    .update({
      status: 'nachgereicht_angefordert',
      updated_at: new Date().toISOString(),
    })
    .eq('id', pflichtdokId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/faelle/${pdok.fall_id}`)
  return { success: true }
}

/**
 * AAR-542 (C5): Synchronisiert pflichtdokumente-Rows mit der Katalog-Regel-
 * Auswertung. Legt fehlende Rows für „regel_pflicht_ohne_db"-Slots an.
 * Idempotent — bestehende Rows werden nicht verändert.
 * Wird vom „Neu evaluieren"-Button der PflichtDocMatrix getriggert.
 */
export async function syncPflichtdokumenteForFall(
  fallId: string,
): Promise<{ success: boolean; error?: string; created?: number }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!['admin', 'kundenbetreuer'].includes(rolle ?? '')) {
    return { success: false, error: 'Nur KB/Admin dürfen die Matrix synchronisieren' }
  }

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, lead_id, vorschaden_erkannt, technische_stellungnahme_status, zeugen_vorhanden')
    .eq('id', fallId)
    .single()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const { data: lead } = fall.lead_id
    ? await supabase.from('leads').select('*').eq('id', fall.lead_id).single()
    : { data: null }

  const { getAlleSlots } = await import('@/lib/dokumente/katalog')
  const { evaluatePflichtdocs } = await import('@/lib/dokumente/pflicht-evaluator')

  const [katalog, existing] = await Promise.all([
    getAlleSlots(supabase),
    supabase
      .from('pflichtdokumente')
      .select('id, dokument_typ, status, pflicht')
      .eq('fall_id', fallId),
  ])

  const matrix = evaluatePflichtdocs({
    katalog,
    fall: fall as unknown as Record<string, unknown>,
    lead: (lead ?? null) as Record<string, unknown> | null,
    pflichtdokumente: (existing.data ?? []) as Array<{
      id: string
      dokument_typ: string
      status: string | null
      pflicht: boolean | null
    }>,
  })

  const fehlend = matrix.filter((e) => e.inkonsistenz === 'regel_pflicht_ohne_db')
  if (fehlend.length === 0) {
    return { success: true, created: 0 }
  }

  const rows = fehlend.map((e) => ({
    fall_id: fallId,
    dokument_typ: e.slot_id,
    pflicht: true,
    status: 'ausstehend',
    quelle: 'system-regel-sync',
  }))

  const { error } = await supabase.from('pflichtdokumente').insert(rows)
  if (error) return { success: false, error: error.message }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true, created: fehlend.length }
}

export async function requestCardentityTypBForFall(
  fallId: string,
): Promise<RequestTypBResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!['admin', 'kundenbetreuer'].includes(rolle ?? '')) {
    return { success: false, error: 'Nur KB/Admin dürfen Typ-B triggern' }
  }

  const { requestCardentityTypB } = await import('@/lib/cardentity/typ-b')
  const result = await requestCardentityTypB('fall', fallId)
  if (result.success) revalidatePath(`/faelle/${fallId}`)
  return result
}

// AAR-684 Phase 2: Datei-Uploads + Anschlussschreiben-OCR + Pflichtdok-Status.

const KATEGORIE_SICHTBARKEIT: Record<string, string[]> = {
  kundendokument: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
  schadensfoto: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
  gutachten: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  'gutachter-foto': ['admin', 'kundenbetreuer', 'sachverstaendiger'],
  kanzlei: ['admin', 'kundenbetreuer', 'kunde', 'kanzlei'],
  unterschrift: ['admin', 'kundenbetreuer', 'kanzlei'],
  sonstiges: ['admin', 'kundenbetreuer'],
  'whatsapp-foto': ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
}

export async function uploadDatei(
  fallId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const file = formData.get('file') as File | null
  if (!file || !(file instanceof File)) return { success: false, error: 'Keine Datei ausgewählt' }

  const kategorie = (formData.get('kategorie') as string) || 'sonstiges'

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const hochgeladen_von_rolle = profile?.rolle ?? 'admin'

  const sichtbar_fuer = KATEGORIE_SICHTBARKEIT[kategorie] ?? ['admin', 'kundenbetreuer']

  // AAR-553: fall-dokumente-Bucket
  const ext = file.name.split('.').pop() ?? 'bin'
  const timestamp = Date.now()
  const storagePath = `admin/${fallId}/${timestamp}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('fall-dokumente')
    .upload(storagePath, file, { contentType: file.type })
  if (uploadErr) return { success: false, error: uploadErr.message }

  const { error: insertErr } = await supabase.from('fall_dokumente').insert({
    fall_id: fallId,
    dokument_typ: kategorie,
    storage_path: storagePath,
    original_filename: file.name,
    groesse_bytes: file.size,
    mime_type: file.type || null,
    kategorie,
    hochgeladen_von_user_id: user.id,
    uploaded_by_sv: hochgeladen_von_rolle === 'sachverstaendiger',
    uploaded_by_kunde: hochgeladen_von_rolle === 'kunde',
    quelle: 'admin',
    sichtbar_fuer,
  })

  if (insertErr) return { success: false, error: insertErr.message }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin/faelle')
  return { success: true }
}

export async function uploadPflichtdokument(
  fallId: string,
  pflichtdokumentId: string,
  url: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('pflichtdokumente')
    .update({
      status: 'hochgeladen',
      dokument_url: url,
      hochgeladen_am: new Date().toISOString(),
    })
    .eq('id', pflichtdokumentId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

// KFZ-113: Anschlussschreiben-Upload mit OCR-Extraktion (Sendedatum + Signatur)
export async function uploadAnschlussschreiben(
  fallId: string,
  fileUrl: string,
  fileName: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  await supabase.from('faelle').update({
    anschlussschreiben_url: fileUrl,
    updated_at: new Date().toISOString(),
  }).eq('id', fallId)

  // AAR-553: fall_dokumente statt dokumente. storage_path aus public-URL
  const pathMatch = fileUrl.match(/\/storage\/v1\/object\/public\/(?:dokumente|fall-dokumente)\/(.+)$/)
  const storagePath = pathMatch ? decodeURIComponent(pathMatch[1]) : fileName
  await supabase.from('fall_dokumente').insert({
    fall_id: fallId,
    dokument_typ: 'anschlussschreiben',
    storage_path: storagePath,
    original_filename: fileName,
    mime_type: 'application/pdf',
    kategorie: 'kanzlei',
    quelle: 'admin-upload',
    hochgeladen_von_user_id: user.id,
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'kanzlei'],
  })

  // OCR (non-critical)
  try {
    const pdfResponse = await fetch(fileUrl)
    if (pdfResponse.ok) {
      const buffer = Buffer.from(await pdfResponse.arrayBuffer())
      const pdfModule = await import('pdf-parse')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = ((pdfModule as any).default ?? pdfModule) as (buffer: Buffer) => Promise<{ text: string }>
      const parsed = await pdfParse(buffer)
      const text = parsed.text

      const sendedatum = extractSendedatum(text)
      const hatUnterschrift = checkUnterschrift(text)

      await supabase.from('faelle').update({
        anschlussschreiben_sendedatum: sendedatum,
        anschlussschreiben_unterschrift: hatUnterschrift,
        anschlussschreiben_ocr_am: new Date().toISOString(),
      }).eq('id', fallId)
    }
  } catch { /* OCR ist nicht kritisch */ }

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Anschlussschreiben hochgeladen',
    beschreibung: `Datei: ${fileName}. OCR-Extraktion durchgeführt.`,
    erstellt_von: user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

function extractSendedatum(text: string): string | null {
  const patterns = [
    /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/,
    /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i,
  ]
  const monateMap: Record<string, string> = {
    januar: '01', februar: '02', 'märz': '03', april: '04', mai: '05', juni: '06',
    juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
  }

  const keywords = ['datum', 'sendedatum', 'gesendet am', 'versandt am', 'unser zeichen', 'ihr zeichen', 'berlin', 'münchen', 'köln', 'hamburg']
  for (const kw of keywords) {
    const idx = text.toLowerCase().indexOf(kw)
    if (idx === -1) continue
    const window = text.slice(Math.max(0, idx - 50), idx + 200)
    for (const pattern of patterns) {
      const match = window.match(pattern)
      if (match) {
        if (match[2] && monateMap[match[2].toLowerCase()]) {
          return `${match[3]}-${monateMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`
        }
        return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
      }
    }
  }

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      if (match[2] && monateMap[match[2].toLowerCase()]) {
        return `${match[3]}-${monateMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`
      }
      return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
    }
  }
  return null
}

function checkUnterschrift(text: string): boolean {
  const keywords = ['unterschrift', 'unterzeichnet', 'gez.', 'mit freundlichen', 'hochachtungsvoll', 'rechtsanwalt', 'rechtsanwältin']
  const lower = text.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}
