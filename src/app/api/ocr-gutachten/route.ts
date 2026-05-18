import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// ─── Regex patterns for German damage assessment reports ─────────────────────

const PATTERNS = {
  schadenhoehe_netto: [
    /(?:Netto[- ]?Reparaturkosten|Reparaturkosten\s*(?:\(netto\))?|Schadenhöhe\s*(?:netto)?)\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
    /(?:Netto-RK|Netto RK)\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
  ],
  wiederbeschaffungswert: [
    /Wiederbeschaffungswert\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
    /WBW\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
  ],
  restwert: [
    /Restwert\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
    /RW\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
  ],
  nutzungsausfall_tage: [
    /Nutzungsausfall\s*(?:dauer)?\s*[:\s]*(\d+)\s*(?:Tage?|Kalendertage)/i,
    /Ausfallzeit\s*[:\s]*(\d+)\s*(?:Tage?)/i,
  ],
  nutzungsausfall_tagessatz: [
    /Nutzungsausfall\s*(?:Tagessatz|pro Tag)\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
    /Tagessatz\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
  ],
  reparaturdauer_tage: [
    /Reparaturdauer\s*[:\s]*(\d+)\s*(?:Arbeitstage|Tage)/i,
    /(?:voraussichtliche\s*)?Reparaturzeit\s*[:\s]*(\d+)/i,
  ],
  gutachter_honorar: [
    /(?:Gutachter[- ]?Honorar|Sachverständigenkosten|SV-Kosten|Honorar)\s*[:\s]*(\d[\d.,]*)\s*(?:EUR|€)/i,
  ],
  fin_vin: [
    /(?:FIN|VIN|Fahrzeug-Ident(?:ifikations)?-?Nr|Fahrgestellnummer)\s*[:\s]*([A-HJ-NPR-Z0-9]{17})/i,
    /\b(W[A-Z0-9]{2}[A-HJ-NPR-Z0-9]{14})\b/, // German VINs start with W
  ],
}

function parseGermanNumber(str: string): number {
  // "1.234,56" → 1234.56
  return parseFloat(str.replace(/\./g, '').replace(',', '.'))
}

function extractField(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

// ─── POST /api/ocr-gutachten ────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const { fall_id, pdf_url } = await request.json()
    if (!fall_id) {
      return NextResponse.json({ error: 'fall_id erforderlich' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Download PDF from Supabase Storage
    let pdfText = ''
    if (pdf_url) {
      try {
        const response = await fetch(pdf_url)
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer())
          // pdf-parse v2 (2.4.x): Klassen-API — new PDFParse({data}).getText().
          // Die alte v1-Funktions-API (require('pdf-parse')(buffer)) existiert
          // nicht mehr; ihr Aufruf warf "pdfParse is not a function" und liess
          // pdfText leer -> Route stieg immer mit "PDF konnte nicht ..." aus.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { PDFParse } = require('pdf-parse') as typeof import('pdf-parse')
          const parser = new PDFParse({ data: buffer })
          try {
            pdfText = (await parser.getText()).text
          } finally {
            await parser.destroy()
          }
        }
      } catch (e) {
        console.error('PDF parse error:', e)
      }
    }

    if (!pdfText) {
      return NextResponse.json({
        success: false,
        message: 'PDF konnte nicht ausgelesen werden. Bitte Werte manuell eingeben.',
        extracted: {},
      })
    }

    // Extract fields
    const schadenhoehe_raw = extractField(pdfText, PATTERNS.schadenhoehe_netto)
    const wbw_raw = extractField(pdfText, PATTERNS.wiederbeschaffungswert)
    const restwert_raw = extractField(pdfText, PATTERNS.restwert)
    const nutzungsausfall_tage_raw = extractField(pdfText, PATTERNS.nutzungsausfall_tage)
    const nutzungsausfall_tagessatz_raw = extractField(pdfText, PATTERNS.nutzungsausfall_tagessatz)
    const reparaturdauer_raw = extractField(pdfText, PATTERNS.reparaturdauer_tage)
    const honorar_raw = extractField(pdfText, PATTERNS.gutachter_honorar)
    const fin_raw = extractField(pdfText, PATTERNS.fin_vin)

    const schadenhoehe_netto = schadenhoehe_raw ? parseGermanNumber(schadenhoehe_raw) : null
    const wiederbeschaffungswert = wbw_raw ? parseGermanNumber(wbw_raw) : null
    const restwert = restwert_raw ? parseGermanNumber(restwert_raw) : null
    const nutzungsausfall_tage = nutzungsausfall_tage_raw ? parseInt(nutzungsausfall_tage_raw) : null
    const nutzungsausfall_tagessatz = nutzungsausfall_tagessatz_raw ? parseGermanNumber(nutzungsausfall_tagessatz_raw) : null
    const reparaturdauer_tage = reparaturdauer_raw ? parseInt(reparaturdauer_raw) : null
    const gutachter_honorar = honorar_raw ? parseGermanNumber(honorar_raw) : null
    const fin_vin = fin_raw ?? null

    // Determine if total loss. Bleibt null wenn weder aus WBW/Schadenhoehe
    // ableitbar noch das Wort "totalschaden" im PDF vorkommt — sonst wuerde ein
    // unbedingtes false beim apply_gutachten_ocr-COALESCE-Merge ein bereits
    // gesetztes Totalschaden-Flag ueberschreiben.
    const totalschaden: boolean | null =
      wiederbeschaffungswert != null && schadenhoehe_netto != null
        ? schadenhoehe_netto > wiederbeschaffungswert
        : pdfText.toLowerCase().includes('totalschaden')
          ? true
          : null

    const extracted = {
      schadenhoehe_netto,
      wiederbeschaffungswert,
      restwert,
      nutzungsausfall_tage,
      nutzungsausfall_tagessatz,
      reparaturdauer_tage,
      gutachter_honorar,
      fin_vin,
      totalschaden,
    }

    // Cluster F+G PR-2b (#1322) hat restwert/wiederbeschaffungswert/
    // nutzungsausfall_tage/totalschaden aus faelle gedroppt — diese G-Werte
    // leben jetzt in der gutachten-Sub-Tabelle. faelle bekommt nur noch die
    // dort weiterhin existierenden OCR-Spalten; die 4 G-Werte gehen via RPC
    // apply_gutachten_ocr (kanonischer Writer, analog lib/ai/gutachten-ocr.ts).
    // CMM-44 SP-B PR2c: schadens_hoehe_netto lebt auf claims (SSoT) —
    // aus faelleUpdate entfernt, wird unten separat auf claims geschrieben.
    const faelleUpdate: Record<string, unknown> = {
      ocr_extrahiert_am: new Date().toISOString(),
      ocr_rohdaten: { text_length: pdfText.length, extracted },
    }
    if (nutzungsausfall_tagessatz != null) faelleUpdate.nutzungsausfall_tagessatz = nutzungsausfall_tagessatz
    if (reparaturdauer_tage != null) faelleUpdate.reparaturdauer_tage = reparaturdauer_tage
    if (gutachter_honorar != null) faelleUpdate.gutachter_honorar = gutachter_honorar
    if (fin_vin) faelleUpdate.fin_vin = fin_vin

    const { data: fallRow, error: faelleError } = await admin
      .from('faelle')
      .update(faelleUpdate)
      .eq('id', fall_id)
      .select('claim_id')
      .maybeSingle()
    if (faelleError) {
      console.error('[ocr-gutachten] faelle-Update fehlgeschlagen:', faelleError.message)
    }

    // Die 4 G-Werte (restwert, WBW, nutzungsausfall_tage, totalschaden) gehen in
    // die gutachten-Sub-Tabelle. apply_gutachten_ocr legt/aktualisiert den Row
    // per ON CONFLICT mit COALESCE-Merge. Non-critical — ein RPC-Fehler darf den
    // bereits erfolgten faelle-Write nicht zuruecknehmen.
    const gutachtenWerte: Record<string, unknown> = {}
    if (wiederbeschaffungswert != null) gutachtenWerte.wiederbeschaffungswert = wiederbeschaffungswert
    if (restwert != null) gutachtenWerte.restwert = restwert
    if (nutzungsausfall_tage != null) gutachtenWerte.nutzungsausfall_tage = nutzungsausfall_tage
    if (totalschaden != null) gutachtenWerte.totalschaden = totalschaden

    // gutachten.gutachten_ocr_manuell_ueberschrieben ist NOT NULL DEFAULT false;
    // apply_gutachten_ocr inserted die Spalte beim Fresh-Row explizit aus
    // p_values -> beim expliziten Insert greift der Spalten-DEFAULT nicht, ohne
    // den Key schlaegt der Insert mit not-null-violation fehl. Automatisierte
    // OCR-Werte sind per Definition nicht manuell ueberschrieben -> false.
    if (Object.keys(gutachtenWerte).length > 0) {
      gutachtenWerte.gutachten_ocr_manuell_ueberschrieben = false
    }

    const claimId = fallRow?.claim_id ?? null

    // CMM-44 SP-B PR2c: schadens_hoehe_netto auf claims schreiben (SSoT).
    if (claimId && schadenhoehe_netto != null) {
      const { error: claimOcrErr } = await admin
        .from('claims')
        .update({ schadens_hoehe_netto: schadenhoehe_netto })
        .eq('id', claimId)
      if (claimOcrErr) {
        console.error('[ocr-gutachten] claims-Update (schadens_hoehe_netto) fehlgeschlagen:', claimOcrErr.message)
      }
    }

    if (claimId && Object.keys(gutachtenWerte).length > 0) {
      const { error: gutachtenError } = await admin.rpc('apply_gutachten_ocr', {
        p_claim_id: claimId,
        p_values: gutachtenWerte,
      })
      if (gutachtenError) {
        console.error('[ocr-gutachten] apply_gutachten_ocr fehlgeschlagen:', gutachtenError.message)
      }
    } else if (!claimId) {
      console.warn(`[ocr-gutachten] Fall ${fall_id} ohne claim_id — G-Werte nicht in gutachten gespeichert`)
    }

    return NextResponse.json({
      success: true,
      extracted,
      fieldsFound: Object.entries(extracted).filter(([, v]) => v != null).length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 }
    )
  }
}
