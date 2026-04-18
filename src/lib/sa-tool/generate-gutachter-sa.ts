// AAR-360: SA-Tool — Kunden-Unterschrift auf Gutachter-SA-Vorlage mergen.
//
// Rechtlicher Kontext: Claimondo GmbH darf den Auftrag NICHT als eigene
// Firma an den Gutachter abtreten. Der Kunde unterschreibt im FlowLink die
// Vollmacht, dass Claimondo seine Unterschrift auf die individuelle
// SA-Vorlage des jeweiligen Gutachters setzen darf. Das Ergebnis ist ein
// SV-spezifisches SA-PDF, das Kunde, Gutachter, KB und Kanzlei sehen.
//
// Flow:
// 1. SV-Datensatz laden (sa_vorlage_storage_path, sa_vorlage_status,
//    sa_vorlage_signatur_konfig) — nur wenn status='geprueft' und path
//    gesetzt, wird gemerged.
// 2. Gutachter-SA-Vorlage-PDF aus Storage laden (Bucket 'fall-dokumente').
// 3. Kunden-Unterschrift-PNG aus Storage laden (Bucket 'unterschriften').
// 4. pdf-lib: Unterschrift + Datum + Kundenname auf die konfigurierte
//    Position zeichnen (Fallback: Default-Position unten links).
// 5. Fertiges PDF nach fall-dokumente/sa-dokumente/{fall_id}/sa_gutachter_...
//    speichern + fall_dokumente-Row anlegen (sichtbar_fuer = Kunde, SV, KB,
//    Kanzlei, Admin).
//
// Fehlerbehandlung: Kein throw nach aussen — Return-Object. Der Aufrufer
// in signSAandCreateFall ist Fire-and-Forget; ein fehlender SV-Vorlage-
// Upload darf den Fall-Flow NIE blockieren.

import type { SupabaseClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export type GenerateGutachterSAResult =
  | { success: true; storagePath: string; publicUrl: string; dokumentId: string }
  | { success: false; error: string; skipped?: boolean }

type SignaturKonfig = {
  page?: number
  unterschrift_position?: { x: number; y: number; width: number; height: number }
  datum_position?: { x: number; y: number }
  name_position?: { x: number; y: number }
}

// Default-Position (unten links, A4 ~ 595x842pt). Dient als Fallback
// solange pro-SV-Konfig noch nicht gepflegt ist (Admin-UI folgt).
const DEFAULT_KONFIG: Required<SignaturKonfig> = {
  page: 0,
  unterschrift_position: { x: 60, y: 100, width: 180, height: 60 },
  datum_position: { x: 60, y: 180 },
  name_position: { x: 60, y: 75 },
}

type GenerateArgs = {
  admin: SupabaseClient
  fallId: string
  svId: string
  kundenVorname: string | null
  kundenNachname: string | null
  /**
   * Public-URL der Kunden-Unterschrift (PNG aus dem `unterschriften`-Bucket).
   * Optional — fällt zurück auf `faelle.sa_unterschrift_url` bzw.
   * `faelle.abtretung_pdf` wenn nicht übergeben.
   */
  kundenSignaturUrl?: string | null
}

export async function generateGutachterSA({
  admin,
  fallId,
  svId,
  kundenVorname,
  kundenNachname,
  kundenSignaturUrl,
}: GenerateArgs): Promise<GenerateGutachterSAResult> {
  try {
    // 1. SV-Daten laden
    const { data: sv, error: svErr } = await admin
      .from('sachverstaendige')
      .select('sa_vorlage_storage_path, sa_vorlage_status, sa_vorlage_signatur_konfig')
      .eq('id', svId)
      .maybeSingle()
    if (svErr) return { success: false, error: `SV-Lookup fehlgeschlagen: ${svErr.message}` }
    if (!sv) return { success: false, error: 'SV nicht gefunden', skipped: true }

    if (sv.sa_vorlage_status !== 'geprueft') {
      return {
        success: false,
        skipped: true,
        error: `SA-Vorlage nicht freigegeben (status=${sv.sa_vorlage_status ?? 'null'}) — kein Merge`,
      }
    }
    if (!sv.sa_vorlage_storage_path) {
      return { success: false, skipped: true, error: 'Keine SA-Vorlage-Pfad gesetzt' }
    }

    // 2. Kunden-Unterschrift-URL bestimmen. Der FlowLink-Caller kann sie
    // direkt übergeben; sonst Fallback auf persistierte Fall-Spalten.
    const { data: fall, error: fallErr } = await admin
      .from('faelle')
      .select('sa_unterschrift_url, abtretung_pdf, fall_nummer')
      .eq('id', fallId)
      .maybeSingle()
    if (fallErr || !fall) {
      return { success: false, error: `Fall-Lookup fehlgeschlagen: ${fallErr?.message ?? 'not found'}` }
    }
    const fallRow = fall as { sa_unterschrift_url: string | null; abtretung_pdf: string | null; fall_nummer: string | null }
    const signaturUrl = kundenSignaturUrl ?? fallRow.sa_unterschrift_url ?? fallRow.abtretung_pdf ?? null
    if (!signaturUrl) {
      return { success: false, skipped: true, error: 'Keine Kunden-Unterschrift vorhanden' }
    }

    // 3. PDF-Vorlage laden (Storage-Download via storage-API, da Pfad ohne
    // Bucket-Präfix gespeichert ist — siehe uploadSaVorlage).
    const { data: pdfBlob, error: pdfDlErr } = await admin.storage
      .from('fall-dokumente')
      .download(sv.sa_vorlage_storage_path as string)
    if (pdfDlErr || !pdfBlob) {
      return { success: false, error: `SA-Vorlage-Download fehlgeschlagen: ${pdfDlErr?.message ?? 'no data'}` }
    }
    const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer())

    // 4. Unterschrift-PNG via public-URL fetchen (liegt im 'unterschriften'-
    // Bucket, ist public). Alternativ könnte man den Storage-Pfad parsen,
    // aber der fetch ist robuster gegen Bucket-Renames.
    const pngResp = await fetch(signaturUrl)
    if (!pngResp.ok) {
      return { success: false, error: `Signatur-Download fehlgeschlagen: HTTP ${pngResp.status}` }
    }
    const pngBytes = new Uint8Array(await pngResp.arrayBuffer())

    // 5. pdf-lib Merge
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const pngImage = await pdfDoc.embedPng(pngBytes)
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)

    const konfigRaw = (sv.sa_vorlage_signatur_konfig ?? null) as SignaturKonfig | null
    const konfig: Required<SignaturKonfig> = {
      page: konfigRaw?.page ?? DEFAULT_KONFIG.page,
      unterschrift_position: konfigRaw?.unterschrift_position ?? DEFAULT_KONFIG.unterschrift_position,
      datum_position: konfigRaw?.datum_position ?? DEFAULT_KONFIG.datum_position,
      name_position: konfigRaw?.name_position ?? DEFAULT_KONFIG.name_position,
    }

    const pages = pdfDoc.getPages()
    const pageIndex = Math.min(Math.max(0, konfig.page), pages.length - 1)
    const page = pages[pageIndex]

    // Unterschrift platzieren
    page.drawImage(pngImage, {
      x: konfig.unterschrift_position.x,
      y: konfig.unterschrift_position.y,
      width: konfig.unterschrift_position.width,
      height: konfig.unterschrift_position.height,
    })

    // Datum (DD.MM.YYYY)
    const today = new Date()
    const datumStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`
    page.drawText(datumStr, {
      x: konfig.datum_position.x,
      y: konfig.datum_position.y,
      size: 11,
      font: helvetica,
      color: rgb(0, 0, 0),
    })

    // Kundenname
    const kundenName = [kundenVorname, kundenNachname].filter(Boolean).join(' ').trim() || 'Kunde'
    page.drawText(kundenName, {
      x: konfig.name_position.x,
      y: konfig.name_position.y,
      size: 11,
      font: helvetica,
      color: rgb(0, 0, 0),
    })

    const outBytes = await pdfDoc.save()

    // 6. Upload fertiges PDF
    const ts = Date.now()
    const outPath = `sa-dokumente/${fallId}/sa_gutachter_${svId}_${ts}.pdf`
    const outBlob = new Blob([outBytes as BlobPart], { type: 'application/pdf' })
    const { error: upErr } = await admin.storage
      .from('fall-dokumente')
      .upload(outPath, outBlob, { contentType: 'application/pdf', upsert: true })
    if (upErr) {
      return { success: false, error: `Upload fehlgeschlagen: ${upErr.message}` }
    }
    const { data: { publicUrl } } = admin.storage.from('fall-dokumente').getPublicUrl(outPath)

    // 7. fall_dokumente-Row anlegen (AAR-553: dokumente-Tabelle gedroppt)
    // dokument_typ='abtretung' ist der bestehende Enum-Wert für SA-artige Dokumente.
    // kategorie='sa-gutachter' differenziert gegen die generische Kunden-SA
    // (kategorie='unterschrift' aus generateSAPdf).
    const dateiName = `SA_Gutachter_${fallRow.fall_nummer ?? fallId.slice(0, 8)}.pdf`
    const { data: dokRow, error: insErr } = await admin
      .from('fall_dokumente')
      .insert({
        fall_id: fallId,
        dokument_typ: 'abtretung',
        kategorie: 'sa-gutachter',
        quelle: 'sa-tool',
        storage_path: outPath,
        original_filename: dateiName,
        groesse_bytes: outBytes.byteLength,
        mime_type: 'application/pdf',
        sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei', 'kunde'],
        beschreibung: 'AAR-360: Kunden-Unterschrift auf Gutachter-SA-Vorlage (pdf-lib Merge)',
      })
      .select('id')
      .single()
    if (insErr || !dokRow) {
      return { success: false, error: `fall_dokumente-Insert fehlgeschlagen: ${insErr?.message ?? 'no row'}` }
    }

    return { success: true, storagePath: outPath, publicUrl, dokumentId: dokRow.id as string }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
