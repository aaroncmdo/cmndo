// Aaron 2026-04-30: Multi-Doc-SA-Tool. Beim Fall-Anlage werden alle
// vorhandenen SV-Pflichtdokumente (Sicherungsabtretung ODER
// Honorarvereinbarung + Datenschutzerklärung + Widerrufsbelehrung)
// mit der Kunden-Unterschrift versehen, im Storage abgelegt und in
// fall_dokumente eingetragen — sichtbar nur für SV / Admin / KB /
// Kanzlei (NICHT Kunde — der Kunde sieht in seiner Fallakte stattdessen
// die Claimondo-eigenen Standard-Dokumente).
//
// Strategie:
//  - Pro Slot eine `pflichtdokumente`-Row mit status='hochgeladen' oder
//    'geprueft' und gesetztem `dokument_url` laden
//  - Original-PDF aus `fall-dokumente/sv-pflicht/{svId}/{slotId}/...`
//    runterladen
//  - Eine zusätzliche Signatur-Seite anhängen (Datum + Name + PNG-
//    Unterschrift). Anhang statt Position-Konfig, weil pro Slot pro SV
//    eine Position-Konfig zu pflegen Wochen Onboarding-Aufwand wäre und
//    rechtlich keine Pflicht ist (eine separate Signatur-Seite mit klarer
//    Bezugnahme auf das Dokument ist gangbar)
//  - Output landet in `claim/{claim_id}/signed/{slotId}_{ts}.pdf` damit
//    er klar zum Claim gehört (CMM-34 Storage-Architektur am Claim)
//  - fall_dokumente-Row mit kategorie='vertrag-signiert', sichtbar_fuer
//    OHNE 'kunde'

import type { SupabaseClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PFLICHT_SLOTS = [
  'sv_sicherungsabtretung',
  'sv_honorarvereinbarung',
  'sv_datenschutzerklaerung',
  'sv_widerrufsbelehrung',
] as const

const SLOT_LABEL: Record<(typeof PFLICHT_SLOTS)[number], string> = {
  sv_sicherungsabtretung: 'Sicherungsabtretung',
  sv_honorarvereinbarung: 'Honorarvereinbarung',
  sv_datenschutzerklaerung: 'Datenschutzerklärung',
  sv_widerrufsbelehrung: 'Widerrufsbelehrung',
}

export type GeneratePflichtdokResult =
  | { success: true; storagePath: string; slotId: string; dokumentId: string }
  | { success: false; slotId: string; error: string; skipped?: boolean }

type Args = {
  admin: SupabaseClient
  fallId: string
  claimId: string | null
  svId: string
  kundenVorname: string | null
  kundenNachname: string | null
  /** Public-URL der Kunden-Unterschrift-PNG (aus dem `unterschriften`-Bucket). */
  kundenSignaturUrl: string
}

export async function generateGutachterPflichtdokumente(
  args: Args,
): Promise<GeneratePflichtdokResult[]> {
  const results: GeneratePflichtdokResult[] = []

  // PNG einmal laden — wird auf alle Dokumente kopiert
  let pngBytes: Uint8Array
  try {
    const r = await fetch(args.kundenSignaturUrl)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    pngBytes = new Uint8Array(await r.arrayBuffer())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return PFLICHT_SLOTS.map((slot) => ({
      success: false as const,
      slotId: slot,
      error: `Signatur-PNG-Download fehlgeschlagen: ${msg}`,
    }))
  }

  // Vorhandene Pflichtdokumente des SVs laden
  const { data: pflichtRows, error: pflichtErr } = await args.admin
    .from('pflichtdokumente')
    .select('id, dokument_typ, status, dokument_url')
    .eq('sv_id', args.svId)
    .in('dokument_typ', PFLICHT_SLOTS as unknown as string[])

  if (pflichtErr) {
    return PFLICHT_SLOTS.map((slot) => ({
      success: false as const,
      slotId: slot,
      error: `Pflichtdok-Lookup: ${pflichtErr.message}`,
    }))
  }

  const byType = new Map(
    (pflichtRows ?? []).map((r) => [r.dokument_typ as string, r]),
  )

  const kundenName =
    [args.kundenVorname, args.kundenNachname].filter(Boolean).join(' ').trim() ||
    'Kunde'

  // Pro Slot mergen
  for (const slotId of PFLICHT_SLOTS) {
    const row = byType.get(slotId)
    if (!row) {
      results.push({
        success: false,
        slotId,
        skipped: true,
        error: 'Kein Pflichtdokument vorhanden',
      })
      continue
    }
    if (!row.dokument_url) {
      results.push({
        success: false,
        slotId,
        skipped: true,
        error: 'Pflichtdokument hat keine Storage-URL',
      })
      continue
    }
    const status = (row.status as string | null) ?? null
    if (status !== 'hochgeladen' && status !== 'geprueft') {
      results.push({
        success: false,
        slotId,
        skipped: true,
        error: `Pflichtdokument-Status=${status} — kein Merge`,
      })
      continue
    }

    try {
      const result = await mergeOneDoc({
        admin: args.admin,
        fallId: args.fallId,
        claimId: args.claimId,
        svId: args.svId,
        slotId,
        slotLabel: SLOT_LABEL[slotId],
        sourcePath: row.dokument_url as string,
        pngBytes,
        kundenName,
      })
      results.push(result)
    } catch (err) {
      results.push({
        success: false,
        slotId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

async function mergeOneDoc({
  admin,
  fallId,
  claimId,
  svId,
  slotId,
  slotLabel,
  sourcePath,
  pngBytes,
  kundenName,
}: {
  admin: SupabaseClient
  fallId: string
  claimId: string | null
  svId: string
  slotId: string
  slotLabel: string
  sourcePath: string
  pngBytes: Uint8Array
  kundenName: string
}): Promise<GeneratePflichtdokResult> {
  // 1. Original-PDF runterladen
  const { data: pdfBlob, error: dlErr } = await admin.storage
    .from('fall-dokumente')
    .download(sourcePath)
  if (dlErr || !pdfBlob) {
    return {
      success: false,
      slotId,
      error: `Original-Download: ${dlErr?.message ?? 'no data'}`,
    }
  }
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer())

  // 2. PDF öffnen + Signatur-Seite anhängen
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const pngImage = await pdfDoc.embedPng(pngBytes)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page = pdfDoc.addPage([595, 842]) // A4 portrait
  const { width, height } = page.getSize()

  // Header
  page.drawText('Elektronische Unterschrift', {
    x: 60,
    y: height - 80,
    size: 18,
    font: helveticaBold,
    color: rgb(0.05, 0.1, 0.25),
  })
  page.drawText(
    `zum Dokument: ${slotLabel}`,
    {
      x: 60,
      y: height - 110,
      size: 12,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.4),
    },
  )

  // Trenner
  page.drawLine({
    start: { x: 60, y: height - 130 },
    end: { x: width - 60, y: height - 130 },
    thickness: 0.5,
    color: rgb(0.7, 0.75, 0.85),
  })

  // Body
  const today = new Date()
  const datumStr = `${String(today.getDate()).padStart(2, '0')}.${String(
    today.getMonth() + 1,
  ).padStart(2, '0')}.${today.getFullYear()}`

  const introText =
    `Hiermit bestätige ich, ${kundenName}, mit meiner unten dargestellten ` +
    `elektronischen Unterschrift den Inhalt des oben genannten Dokuments. ` +
    `Diese Unterschrift wurde im Rahmen des Claimondo-Auftrags-Prozesses ` +
    `digital erfasst.`

  drawWrappedText(page, introText, {
    x: 60,
    y: height - 160,
    maxWidth: width - 120,
    fontSize: 11,
    lineHeight: 16,
    font: helvetica,
    color: rgb(0.15, 0.15, 0.2),
  })

  // Datum
  page.drawText('Datum:', {
    x: 60,
    y: 320,
    size: 10,
    font: helveticaBold,
    color: rgb(0.3, 0.3, 0.4),
  })
  page.drawText(datumStr, {
    x: 110,
    y: 320,
    size: 11,
    font: helvetica,
    color: rgb(0, 0, 0),
  })

  // Unterzeichner
  page.drawText('Unterzeichner:', {
    x: 60,
    y: 295,
    size: 10,
    font: helveticaBold,
    color: rgb(0.3, 0.3, 0.4),
  })
  page.drawText(kundenName, {
    x: 145,
    y: 295,
    size: 11,
    font: helvetica,
    color: rgb(0, 0, 0),
  })

  // Unterschrift
  page.drawText('Unterschrift:', {
    x: 60,
    y: 250,
    size: 10,
    font: helveticaBold,
    color: rgb(0.3, 0.3, 0.4),
  })
  page.drawImage(pngImage, {
    x: 60,
    y: 130,
    width: 220,
    height: 90,
  })
  page.drawLine({
    start: { x: 60, y: 125 },
    end: { x: 280, y: 125 },
    thickness: 0.5,
    color: rgb(0.5, 0.55, 0.65),
  })

  // Footer
  page.drawText(
    'Claimondo GmbH · Elektronische Signatur gemäß eIDAS-Verordnung',
    {
      x: 60,
      y: 60,
      size: 8,
      font: helvetica,
      color: rgb(0.55, 0.6, 0.7),
    },
  )

  const outBytes = await pdfDoc.save()

  // 3. Output-Pfad: claim-zentriert wenn claim_id da ist, sonst fallback
  // auf fall_id (alte Fälle ohne claim_id — sollte nach CMM-32 nicht
  // mehr vorkommen, aber Defense-in-Depth).
  const ts = Date.now()
  const baseDir = claimId
    ? `claim/${claimId}/signed`
    : `fall/${fallId}/signed`
  const outPath = `${baseDir}/${slotId}_${ts}.pdf`

  const outBlob = new Blob([outBytes as BlobPart], {
    type: 'application/pdf',
  })
  const { error: upErr } = await admin.storage
    .from('fall-dokumente')
    .upload(outPath, outBlob, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (upErr) {
    return { success: false, slotId, error: `Upload: ${upErr.message}` }
  }

  // 4. fall_dokumente-Row anlegen — sichtbar NUR für SV/Admin/KB/Kanzlei
  // (Aaron-Spec: Kunde sieht stattdessen die Claimondo-Standard-Doks)
  const dateiName = `${slotLabel.replace(/\s+/g, '_')}_signiert.pdf`
  const { data: dokRow, error: insErr } = await admin
    .from('fall_dokumente')
    .insert({
      fall_id: fallId,
      dokument_typ: 'vertrag',
      kategorie: 'vertrag-signiert',
      quelle: 'sa-tool',
      storage_path: outPath,
      original_filename: dateiName,
      groesse_bytes: outBytes.byteLength,
      mime_type: 'application/pdf',
      sichtbar_fuer: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kanzlei'],
      beschreibung: `${slotLabel} mit Kunden-Unterschrift (SV ${svId})`,
    })
    .select('id')
    .single()
  if (insErr || !dokRow) {
    return {
      success: false,
      slotId,
      error: `fall_dokumente-Insert: ${insErr?.message ?? 'no row'}`,
    }
  }

  return {
    success: true,
    slotId,
    storagePath: outPath,
    dokumentId: dokRow.id as string,
  }
}

function drawWrappedText(
  page: import('pdf-lib').PDFPage,
  text: string,
  opts: {
    x: number
    y: number
    maxWidth: number
    fontSize: number
    lineHeight: number
    font: import('pdf-lib').PDFFont
    color: import('pdf-lib').RGB
  },
) {
  const words = text.split(/\s+/)
  let line = ''
  let cursorY = opts.y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    const w = opts.font.widthOfTextAtSize(test, opts.fontSize)
    if (w > opts.maxWidth && line) {
      page.drawText(line, {
        x: opts.x,
        y: cursorY,
        size: opts.fontSize,
        font: opts.font,
        color: opts.color,
      })
      cursorY -= opts.lineHeight
      line = word
    } else {
      line = test
    }
  }
  if (line) {
    page.drawText(line, {
      x: opts.x,
      y: cursorY,
      size: opts.fontSize,
      font: opts.font,
      color: opts.color,
    })
  }
}
