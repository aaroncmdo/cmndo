import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { berechneLeadpreis } from '@/lib/leadpreis'

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

    const supabase = await createClient()

    // Download PDF from Supabase Storage
    let pdfText = ''
    if (pdf_url) {
      try {
        const response = await fetch(pdf_url)
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer())
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
          const data = await pdfParse(buffer)
          pdfText = data.text
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

    // Determine if total loss
    const totalschaden = wiederbeschaffungswert != null && schadenhoehe_netto != null
      ? schadenhoehe_netto > wiederbeschaffungswert
      : pdfText.toLowerCase().includes('totalschaden')

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

    // Update faelle with extracted data
    const updateData: Record<string, unknown> = {
      ocr_extrahiert_am: new Date().toISOString(),
      ocr_rohdaten: { text_length: pdfText.length, extracted },
    }

    if (schadenhoehe_netto != null) updateData.schadenhoehe_netto = schadenhoehe_netto
    if (wiederbeschaffungswert != null) updateData.wiederbeschaffungswert = wiederbeschaffungswert
    if (restwert != null) updateData.restwert = restwert
    if (nutzungsausfall_tage != null) updateData.nutzungsausfall_tage = nutzungsausfall_tage
    if (nutzungsausfall_tagessatz != null) updateData.nutzungsausfall_tagessatz = nutzungsausfall_tagessatz
    if (reparaturdauer_tage != null) updateData.reparaturdauer_tage = reparaturdauer_tage
    if (gutachter_honorar != null) updateData.gutachter_honorar = gutachter_honorar
    if (fin_vin) updateData.fin_vin = fin_vin
    updateData.totalschaden = totalschaden

    await supabase.from('faelle').update(updateData).eq('id', fall_id)

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
