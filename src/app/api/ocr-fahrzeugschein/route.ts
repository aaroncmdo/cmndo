import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ─── Field-code patterns on a German Fahrzeugschein (ZB Teil I) ─────────
// A   = Kennzeichen
// B   = Datum der Erstzulassung
// C.1 = Halter (Nachname, Vorname  OR  Firmenname)
// C.3 = Adresse (Straße Hausnr, PLZ Ort)
// D.1 = Marke
// D.2 = Typ / Variante / Version
// D.3 = Handelsbezeichnung
// E   = FIN (Fahrzeug-Identifizierungsnummer, 17 alphanumeric)
// 2.1 = HSN (Herstellerschlüsselnummer, 4 digits)
// 2.2 = TSN (Typschlüsselnummer, 3 alphanumeric)

const FIN_REGEX = /\b([A-HJ-NPR-Z0-9]{17})\b/gi
const DATE_REGEX = /\b(\d{2}\.\d{2}\.\d{4})\b/
const PLZ_ORT_REGEX = /\b(\d{5})\s+(.+)/
const HSN_REGEX = /\b(\d{4})\b/
const TSN_REGEX = /\b([A-Z0-9]{3})\b/i

interface ExtractedData {
  kennzeichen: string | null
  erstzulassung: string | null
  // AAR-181: Baujahr wird aus Erstzulassung abgeleitet (DD.MM.YYYY → Jahr)
  fahrzeug_baujahr: number | null
  halter_nachname: string | null
  halter_vorname: string | null
  halter_strasse: string | null
  halter_plz: string | null
  halter_stadt: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  fin_vin: string | null
  hsn: string | null
  tsn: string | null
}

function parseZB1Fields(fullText: string): ExtractedData {
  const result: ExtractedData = {
    kennzeichen: null, erstzulassung: null, fahrzeug_baujahr: null,
    halter_nachname: null, halter_vorname: null,
    halter_strasse: null, halter_plz: null, halter_stadt: null,
    fahrzeug_hersteller: null, fahrzeug_modell: null,
    fin_vin: null, hsn: null, tsn: null,
  }

  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const nextLine = lines[i + 1] ?? ''
    const trimmed = line.replace(/[()[\]]/g, '').trim()

    // FIN — 17-char alphanumeric
    if (!result.fin_vin) {
      const finMatch = line.match(FIN_REGEX)
      if (finMatch) result.fin_vin = finMatch[0].toUpperCase()
    }

    // Kennzeichen — after field "A"
    if (/^A$/i.test(trimmed) && nextLine) {
      result.kennzeichen = nextLine.trim()
    }

    // Erstzulassung — after field "B"
    if (/^B$/i.test(trimmed) && nextLine) {
      const dateMatch = nextLine.match(DATE_REGEX)
      if (dateMatch) result.erstzulassung = dateMatch[1]
    }

    // Halter — after field "C.1"
    if (/^C\.?1$/i.test(trimmed) && nextLine) {
      const parts = nextLine.split(/[,;]/).map(p => p.trim())
      if (parts.length >= 2) {
        result.halter_nachname = parts[0]
        result.halter_vorname = parts[1]
      } else {
        result.halter_nachname = nextLine.trim()
      }
    }

    // Adresse — after field "C.3" or "C.4"
    if (/^C\.?[34]$/i.test(trimmed) && nextLine) {
      result.halter_strasse = nextLine.trim()
      const addrNext = lines[i + 2] ?? ''
      const plzMatch = addrNext.match(PLZ_ORT_REGEX)
      if (plzMatch) {
        result.halter_plz = plzMatch[1]
        result.halter_stadt = plzMatch[2].trim()
      }
    }

    // Marke — after field "D.1"
    if (/^D\.?1$/i.test(trimmed) && nextLine) {
      result.fahrzeug_hersteller = nextLine.trim()
    }

    // Typ — after field "D.2" or "D.3"
    if (/^D\.?[23]$/i.test(trimmed) && nextLine && !result.fahrzeug_modell) {
      result.fahrzeug_modell = nextLine.trim()
    }

    // HSN — after field "2.1"
    if (/^2\.?1$/i.test(trimmed) && nextLine) {
      const hsnMatch = nextLine.match(HSN_REGEX)
      if (hsnMatch) result.hsn = hsnMatch[1]
    }

    // TSN — after field "2.2"
    if (/^2\.?2$/i.test(trimmed) && nextLine) {
      const tsnMatch = nextLine.match(TSN_REGEX)
      if (tsnMatch) result.tsn = tsnMatch[1].toUpperCase()
    }
  }

  // Fallback: scan entire text for FIN
  if (!result.fin_vin) {
    const allFins = fullText.match(FIN_REGEX)
    if (allFins && allFins.length > 0) {
      result.fin_vin = allFins[0].toUpperCase()
    }
  }

  // Fallback: Kennzeichen pattern (e.g. K-AB 1234)
  if (!result.kennzeichen) {
    const kzMatch = fullText.match(/\b([A-ZÄÖÜ]{1,3})[\s-]([A-Z]{1,2})[\s]?(\d{1,4})\b/)
    if (kzMatch) result.kennzeichen = `${kzMatch[1]}-${kzMatch[2]} ${kzMatch[3]}`
  }

  // AAR-181: Baujahr aus Erstzulassung ableiten (DD.MM.YYYY → YYYY).
  // Plausibilitäts-Check 1990..currentYear+1, sonst null.
  if (result.erstzulassung) {
    const m = result.erstzulassung.match(/(\d{4})\s*$/)
    if (m) {
      const y = Number(m[1])
      const maxYear = new Date().getFullYear() + 1
      if (y >= 1990 && y <= maxYear) result.fahrzeug_baujahr = y
    }
  }

  return result
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { fall_id, datei_url, image_base64 } = body

    if (!fall_id) {
      return NextResponse.json({ error: 'fall_id erforderlich' }, { status: 400 })
    }
    if (!datei_url && !image_base64) {
      return NextResponse.json({ error: 'datei_url oder image_base64 erforderlich' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GOOGLE_VISION_API_KEY nicht konfiguriert' }, { status: 500 })
    }

    // ─── Step 1: Get image as base64 ────────────────────────────────────────
    let base64Image = image_base64 ?? ''

    if (!base64Image && datei_url) {
      const imgResponse = await fetch(datei_url)
      if (!imgResponse.ok) {
        return NextResponse.json({ error: `Bild konnte nicht geladen werden: ${imgResponse.status}` }, { status: 400 })
      }
      const buffer = await imgResponse.arrayBuffer()
      base64Image = Buffer.from(buffer).toString('base64')
    }

    // Strip data URI prefix if present
    if (base64Image.includes(',')) {
      base64Image = base64Image.split(',')[1]
    }

    // ─── Step 2: Call Google Cloud Vision API ───────────────────────────────
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      }
    )

    if (!visionResponse.ok) {
      const errText = await visionResponse.text()
      console.error('[OCR-ZB1] Vision API error:', errText)
      return NextResponse.json(
        { error: `Google Vision API Fehler: ${visionResponse.status}` },
        { status: 502 }
      )
    }

    const visionData = await visionResponse.json()
    const fullText = visionData.responses?.[0]?.fullTextAnnotation?.text ?? ''

    if (!fullText) {
      return NextResponse.json({
        success: false,
        message: 'Kein Text im Bild erkannt. Bitte besseres Foto hochladen.',
        extracted: null,
        raw_text: '',
      })
    }

    // ─── Step 3: Parse ZB1 fields ───────────────────────────────────────────
    const extracted = parseZB1Fields(fullText)

    // ─── Step 4: Write to faelle table ──────────────────────────────────────
    const supabase = await createClient()

    const updateData: Record<string, unknown> = {
      ocr_rohdaten: { raw_text: fullText, extracted, timestamp: new Date().toISOString() },
      ocr_extrahiert_am: new Date().toISOString(),
    }

    if (extracted.fin_vin) {
      updateData.fin_vin = extracted.fin_vin
      updateData.fin_quelle = 'fahrzeugschein_ocr'
      updateData.fin_extrahiert_am = new Date().toISOString()
    }
    if (extracted.kennzeichen) updateData.kennzeichen = extracted.kennzeichen
    if (extracted.erstzulassung) updateData.erstzulassung = extracted.erstzulassung
    if (extracted.fahrzeug_baujahr != null) updateData.fahrzeug_baujahr = extracted.fahrzeug_baujahr
    if (extracted.halter_vorname) updateData.halter_vorname = extracted.halter_vorname
    if (extracted.halter_nachname) updateData.halter_nachname = extracted.halter_nachname
    if (extracted.halter_strasse) updateData.halter_strasse = extracted.halter_strasse
    if (extracted.halter_plz) updateData.halter_plz = extracted.halter_plz
    if (extracted.halter_stadt) updateData.halter_stadt = extracted.halter_stadt
    if (extracted.fahrzeug_hersteller) updateData.fahrzeug_hersteller = extracted.fahrzeug_hersteller
    if (extracted.fahrzeug_modell) updateData.fahrzeug_modell = extracted.fahrzeug_modell

    const { error: updateError } = await supabase
      .from('faelle')
      .update(updateData)
      .eq('id', fall_id)

    if (updateError) {
      console.error('[OCR-ZB1] DB update error:', updateError)
    }

    // ─── Step 5: Timeline entry ─────────────────────────────────────────────
    await supabase.from('timeline').insert({
      fall_id,
      typ: 'ocr-fahrzeugschein',
      titel: extracted.fin_vin
        ? `ZB1 OCR: FIN ${extracted.fin_vin} extrahiert`
        : 'ZB1 OCR durchgeführt (FIN nicht erkannt)',
      beschreibung: [
        extracted.kennzeichen && `KZ: ${extracted.kennzeichen}`,
        extracted.halter_nachname && `Halter: ${extracted.halter_vorname ?? ''} ${extracted.halter_nachname}`,
        extracted.fahrzeug_hersteller && `Fahrzeug: ${extracted.fahrzeug_hersteller} ${extracted.fahrzeug_modell ?? ''}`,
      ].filter(Boolean).join(' · ') || 'Keine Felder erkannt',
    })

    // ─── Step 6: Auto-trigger CardEntity Typ-A if FIN found ─────────────────
    if (extracted.fin_vin) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      fetch(`${baseUrl}/api/cardentity/typ-a`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fall_id, fin_vin: extracted.fin_vin }),
      }).catch((err) => {
        console.error('[OCR-ZB1] CardEntity trigger failed:', err)
      })
    }

    return NextResponse.json({
      success: true,
      extracted,
      raw_text: fullText,
      fin_found: !!extracted.fin_vin,
      fields_found: Object.entries(extracted).filter(([, v]) => v !== null).length,
      message: extracted.fin_vin
        ? `FIN ${extracted.fin_vin} erkannt. Vorschaden-Check wird ausgeführt.`
        : 'Fahrzeugschein ausgelesen. FIN nicht erkannt — bitte manuell eingeben.',
    })
  } catch (err) {
    console.error('[OCR-ZB1] Unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 }
    )
  }
}
