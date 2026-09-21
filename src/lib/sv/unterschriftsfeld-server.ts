import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PDFDocument } from 'pdf-lib'
import {
  istSignaturSlot,
  validiereSignaturPosition,
  type PdfMasse,
  type SignaturPosition,
} from './unterschriftsfeld'

// Server-Seite des Kunden-Unterschriftsfeldes (Aaron 20.09.2026: „das Unterschriftsfeld muss
// gesetzt werden"). Wird von den SV-Actions (sv-verifizierung-actions) UND den Admin-Actions
// (admin/sachverstaendige/[id]/verifizierung-actions) genutzt — beide bringen ihre eigene
// Auth mit und übergeben hier den Admin-Client; dieses Modul prüft keine Rechte.

const BUCKET = 'fall-dokumente'
const VORSCHAU_SEKUNDEN = 15 * 60

/** Seitenzahl + Maße der ersten Seite (PDF-Punkte) — dieselbe Basis wie der Admin-Klick-Editor. */
export async function ermittlePdfMasse(bytes: Uint8Array): Promise<PdfMasse> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const seiten = pdf.getPageCount()
  const { width, height } = pdf.getPage(0).getSize()
  return { breite: width, hoehe: height, seiten }
}

/**
 * Ein Foto/Scan (JPG/PNG) wird zu einem einseitigen PDF — der Kunde bekommt im Flow immer ein
 * PDF, und das SA-Tool kann nur PDFs mergen (PDFDocument.load wirft bei Bildern).
 */
export async function wrapBildZuPdf(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const img = mime === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  const page = pdf.addPage([img.width, img.height])
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
  return pdf.save()
}

export type DokumentVorschau = {
  slotId: string
  status: string | null
  signedUrl: string
  masse: PdfMasse
  position: SignaturPosition | null
}

/**
 * Signed-URL + Maße + gespeicherte Position eines SV-Dokuments, damit der Editor es zeigen kann.
 * Die Maße werden aus der Datei gelesen (nicht aus der gespeicherten Position), damit ein
 * neu hochgeladenes Dokument nie mit den Maßen des alten geprüft wird.
 */
export async function ladeDokumentVorschau(
  db: SupabaseClient,
  svId: string,
  slotId: string,
): Promise<{ ok: true; vorschau: DokumentVorschau } | { ok: false; error: string }> {
  if (!istSignaturSlot(slotId)) return { ok: false, error: 'Für dieses Dokument ist kein Unterschriftsfeld vorgesehen.' }
  const { data: row, error } = await db
    .from('pflichtdokumente')
    .select('dokument_url, status, signatur_position')
    .eq('sv_id', svId)
    .eq('dokument_typ', slotId)
    .maybeSingle()
  if (error) return { ok: false, error: `Dokument nicht ladbar: ${error.message}` }
  const pfad = (row?.dokument_url as string | null) ?? null
  if (!row || !pfad) return { ok: false, error: 'Für diesen Slot ist noch keine Datei hochgeladen.' }

  const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(pfad)
  if (dlErr || !blob) return { ok: false, error: `Datei nicht lesbar: ${dlErr?.message ?? 'kein Inhalt'}` }
  let masse: PdfMasse
  try {
    masse = await ermittlePdfMasse(new Uint8Array(await blob.arrayBuffer()))
  } catch (err) {
    return { ok: false, error: `Das Dokument ist kein lesbares PDF: ${err instanceof Error ? err.message : String(err)}` }
  }
  const { data: signed, error: urlErr } = await db.storage.from(BUCKET).createSignedUrl(pfad, VORSCHAU_SEKUNDEN)
  if (urlErr || !signed?.signedUrl) return { ok: false, error: `Vorschau-Link fehlgeschlagen: ${urlErr?.message ?? 'kein Link'}` }

  return {
    ok: true,
    vorschau: {
      slotId,
      status: (row.status as string | null) ?? null,
      signedUrl: signed.signedUrl,
      masse,
      position: (row.signatur_position as SignaturPosition | null) ?? null,
    },
  }
}

/**
 * Prüft die Position gegen die echte Datei und speichert sie. Aktiviert das Dokument dabei:
 * ein Slot, der auf 'ausstehend' wartete (Datei da, Feld fehlte), springt auf `aktivStatus`
 * ('hochgeladen' beim SV, 'geprueft' beim Admin). Ein bereits aktives Dokument behält seinen Status.
 */
export async function speichereSignaturPosition(
  db: SupabaseClient,
  svId: string,
  slotId: string,
  input: unknown,
  aktivStatus: 'hochgeladen' | 'geprueft',
): Promise<{ ok: true; position: SignaturPosition; status: string } | { ok: false; error: string }> {
  if (!istSignaturSlot(slotId)) return { ok: false, error: 'Für dieses Dokument ist kein Unterschriftsfeld vorgesehen.' }
  const { data: row, error } = await db
    .from('pflichtdokumente')
    .select('id, dokument_url, status')
    .eq('sv_id', svId)
    .eq('dokument_typ', slotId)
    .maybeSingle()
  if (error) return { ok: false, error: `Dokument nicht ladbar: ${error.message}` }
  const pfad = (row?.dokument_url as string | null) ?? null
  if (!row || !pfad) return { ok: false, error: 'Bitte zuerst die Datei hochladen.' }

  const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(pfad)
  if (dlErr || !blob) return { ok: false, error: `Datei nicht lesbar: ${dlErr?.message ?? 'kein Inhalt'}` }
  let masse: PdfMasse
  try {
    masse = await ermittlePdfMasse(new Uint8Array(await blob.arrayBuffer()))
  } catch (err) {
    return { ok: false, error: `Das Dokument ist kein lesbares PDF: ${err instanceof Error ? err.message : String(err)}` }
  }
  const val = validiereSignaturPosition(input, masse)
  if (!val.ok) return val

  const bisher = (row.status as string | null) ?? null
  const status = bisher === 'hochgeladen' || bisher === 'geprueft' ? bisher : aktivStatus
  const { error: updErr, data: upd } = await db
    .from('pflichtdokumente')
    .update({ signatur_position: val.position, status })
    .eq('id', row.id)
    .select('id')
  if (updErr) return { ok: false, error: `Speichern fehlgeschlagen: ${updErr.message}` }
  if (!upd || upd.length === 0) return { ok: false, error: 'Speichern hat keine Zeile getroffen.' }
  return { ok: true, position: val.position, status }
}
