// ZB1-OCR fuer Self-Dispatch-Anfragen (Gutachter-Finder, ohne fall_id).
// Schreibt direkt auf gutachter_finder_anfragen — beim Konvertieren zu einem
// Fall werden die Felder in faelle/claims uebertragen.
//
// Unterscheidet sich von /api/ocr-fahrzeugschein durch:
// - anfrage_id statt fall_id
// - kein timeline-Insert (Anfragen haben keine Timeline)
// - Imagin-URL wird direkt mitberechnet und gespeichert
// - CarDentity-Vorschaden-Check wird auf 'ausstehend' gesetzt; tatsaechlicher
//   Trigger erfolgt beim Konvertieren der Anfrage zu einem Fall

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { runZB1Ocr } from '@/lib/ocr/zb1-parser'
import { buildImaginUrl } from '@/lib/fahrzeug/imagin'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { anfrage_id, image_base64 } = body

    if (!anfrage_id) {
      return NextResponse.json({ error: 'anfrage_id erforderlich' }, { status: 400 })
    }
    if (!image_base64) {
      return NextResponse.json({ error: 'image_base64 erforderlich' }, { status: 400 })
    }

    const ocrResult = await runZB1Ocr(image_base64)
    if ('error' in ocrResult) {
      return NextResponse.json(
        { error: ocrResult.error },
        { status: ocrResult.status ?? 500 },
      )
    }
    const { fullText, extracted } = ocrResult

    if (!fullText) {
      return NextResponse.json({
        success: false,
        message: 'Kein Text im Bild erkannt — bitte besseres Foto hochladen.',
        extracted: null,
      })
    }

    const supabase = await createClient()

    const updateData: Record<string, unknown> = {
      ocr_rohdaten: { raw_text: fullText, extracted, timestamp: new Date().toISOString() },
      ocr_extrahiert_am: new Date().toISOString(),
    }

    if (extracted.fin_vin) updateData.fin_vin = extracted.fin_vin
    if (extracted.kennzeichen) updateData.kennzeichen = extracted.kennzeichen
    if (extracted.erstzulassung) updateData.erstzulassung = extracted.erstzulassung
    if (extracted.fahrzeug_baujahr != null) updateData.fahrzeug_baujahr = extracted.fahrzeug_baujahr
    if (extracted.fahrzeug_hersteller) updateData.fahrzeug_hersteller = extracted.fahrzeug_hersteller
    if (extracted.fahrzeug_modell) updateData.fahrzeug_modell = extracted.fahrzeug_modell
    if (extracted.fahrzeug_farbe) updateData.fahrzeug_farbe = extracted.fahrzeug_farbe
    if (extracted.halter_vorname) updateData.halter_vorname = extracted.halter_vorname
    if (extracted.halter_nachname) updateData.halter_nachname = extracted.halter_nachname
    if (extracted.halter_strasse) updateData.halter_strasse = extracted.halter_strasse
    if (extracted.halter_plz) updateData.halter_plz = extracted.halter_plz
    if (extracted.halter_stadt) updateData.halter_stadt = extracted.halter_stadt
    if (extracted.hsn) updateData.hsn = extracted.hsn
    if (extracted.tsn) updateData.tsn = extracted.tsn

    // Imagin-URL aus extrahierten Daten bauen — Fahrzeug wird direkt visualisiert.
    if (extracted.fahrzeug_hersteller) {
      const imaginUrl = buildImaginUrl({
        hersteller: extracted.fahrzeug_hersteller,
        modell: extracted.fahrzeug_modell ?? null,
        lackfarbe: null,
        baujahr: extracted.fahrzeug_baujahr ?? extracted.erstzulassung ?? null,
      })
      if (imaginUrl) updateData.imagin_url = imaginUrl
    }

    // Vorschaden-Check ausstehend — wird beim Konvertieren zu Fall ausgefuehrt.
    if (extracted.fin_vin) {
      updateData.vorschaden_check_status = 'ausstehend'
    }

    const { error: updateError } = await supabase
      .from('gutachter_finder_anfragen')
      .update(updateData)
      .eq('id', anfrage_id)

    if (updateError) {
      console.error('[OCR-ZB1-Anfrage] DB update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      extracted,
      imagin_url: updateData.imagin_url ?? null,
      fields_found: Object.entries(extracted).filter(([, v]) => v !== null).length,
      message: extracted.fin_vin
        ? `FIN ${extracted.fin_vin} erkannt — wir prüfen Vorschäden im Hintergrund.`
        : 'Fahrzeugschein ausgelesen.',
    })
  } catch (err) {
    console.error('[OCR-ZB1-Anfrage] Unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    )
  }
}
