// AAR-182: Shared ZB1-Parser — extrahiert aus /api/ocr-fahrzeugschein damit
// sowohl der Fall-Endpoint als auch der Lead-Inbound-Webhook dieselbe Logik
// nutzt. Neue Felder (Baujahr aus Erstzulassung, AAR-181) leben jetzt hier.

const FIN_REGEX = /\b([A-HJ-NPR-Z0-9]{17})\b/gi
const DATE_REGEX = /\b(\d{2}\.\d{2}\.\d{4})\b/
const PLZ_ORT_REGEX = /\b(\d{5})\s+(.+)/
const HSN_REGEX = /\b(\d{4})\b/
const TSN_REGEX = /\b([A-Z0-9]{3})\b/i

// AAR-351: Hersteller-Keywords für Fallback-Extraktion, wenn das Label-
// basierte Matching (^D.1$ auf eigener Zeile) an der Vision-API-Fließtext-
// Ausgabe scheitert. Patterns decken ZB1-typische OCR-Varianten ab
// (z.B. "BAYER.MOT.WERKE" für BMW). Reihenfolge: spezifischere zuerst
// damit "MERCEDES-BENZ" vor "MERCEDES" matcht, "VOLKSWAGEN" vor "VW".
const HERSTELLER_KEYWORDS: Array<{ patterns: RegExp[]; normalized: string }> = [
  { patterns: [/BAYER\.?\s*MOT\.?\s*WERKE/i, /\bBMW\b/], normalized: 'BMW' },
  { patterns: [/\bMERCEDES[-\s]?BENZ\b/i, /\bDAIMLER\b/i, /\bMERCEDES\b/i], normalized: 'Mercedes-Benz' },
  { patterns: [/\bVOLKSWAGEN\b/i, /\bVOLKSW\b/i, /\bVW\b/], normalized: 'VW' },
  { patterns: [/\bAUDI\b/i], normalized: 'Audi' },
  { patterns: [/\bPORSCHE\b/i], normalized: 'Porsche' },
  { patterns: [/\bOPEL\b/i], normalized: 'Opel' },
  { patterns: [/\bFORD\b/i], normalized: 'Ford' },
  { patterns: [/\bTOYOTA\b/i], normalized: 'Toyota' },
  { patterns: [/\bMAZDA\b/i], normalized: 'Mazda' },
  { patterns: [/\bHYUNDAI\b/i], normalized: 'Hyundai' },
  { patterns: [/\bKIA\b/i], normalized: 'Kia' },
  { patterns: [/\bŠKODA\b/i, /\bSKODA\b/i], normalized: 'Skoda' },
  { patterns: [/\bSEAT\b/i], normalized: 'Seat' },
  { patterns: [/\bRENAULT\b/i], normalized: 'Renault' },
  { patterns: [/\bPEUGEOT\b/i], normalized: 'Peugeot' },
  { patterns: [/\bCITROËN\b/i, /\bCITROEN\b/i], normalized: 'Citroën' },
  { patterns: [/\bFIAT\b/i], normalized: 'Fiat' },
  { patterns: [/\bVOLVO\b/i], normalized: 'Volvo' },
  { patterns: [/\bNISSAN\b/i], normalized: 'Nissan' },
  { patterns: [/\bHONDA\b/i], normalized: 'Honda' },
  { patterns: [/\bSUZUKI\b/i], normalized: 'Suzuki' },
  { patterns: [/\bDACIA\b/i], normalized: 'Dacia' },
  { patterns: [/\bMINI\b/i], normalized: 'Mini' },
  { patterns: [/\bSMART\b/i], normalized: 'Smart' },
  { patterns: [/\bTESLA\b/i], normalized: 'Tesla' },
]

export interface ZB1ExtractedData {
  kennzeichen: string | null
  erstzulassung: string | null
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

export function parseZB1Fields(fullText: string): ZB1ExtractedData {
  const result: ZB1ExtractedData = {
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

    if (!result.fin_vin) {
      const finMatch = line.match(FIN_REGEX)
      if (finMatch) result.fin_vin = finMatch[0].toUpperCase()
    }
    if (/^A$/i.test(trimmed) && nextLine) {
      result.kennzeichen = nextLine.trim()
    }
    if (/^B$/i.test(trimmed) && nextLine) {
      const dateMatch = nextLine.match(DATE_REGEX)
      if (dateMatch) result.erstzulassung = dateMatch[1]
    }
    if (/^C\.?1$/i.test(trimmed) && nextLine) {
      const parts = nextLine.split(/[,;]/).map(p => p.trim())
      if (parts.length >= 2) {
        result.halter_nachname = parts[0]
        result.halter_vorname = parts[1]
      } else {
        result.halter_nachname = nextLine.trim()
      }
    }
    if (/^C\.?[34]$/i.test(trimmed) && nextLine) {
      result.halter_strasse = nextLine.trim()
      const addrNext = lines[i + 2] ?? ''
      const plzMatch = addrNext.match(PLZ_ORT_REGEX)
      if (plzMatch) {
        result.halter_plz = plzMatch[1]
        result.halter_stadt = plzMatch[2].trim()
      }
    }
    if (/^D\.?1$/i.test(trimmed) && nextLine) {
      result.fahrzeug_hersteller = nextLine.trim()
    }
    if (/^D\.?[23]$/i.test(trimmed) && nextLine && !result.fahrzeug_modell) {
      result.fahrzeug_modell = nextLine.trim()
    }
    if (/^2\.?1$/i.test(trimmed) && nextLine) {
      const hsnMatch = nextLine.match(HSN_REGEX)
      if (hsnMatch) result.hsn = hsnMatch[1]
    }
    if (/^2\.?2$/i.test(trimmed) && nextLine) {
      const tsnMatch = nextLine.match(TSN_REGEX)
      if (tsnMatch) result.tsn = tsnMatch[1].toUpperCase()
    }
  }

  if (!result.fin_vin) {
    const allFins = fullText.match(FIN_REGEX)
    if (allFins && allFins.length > 0) {
      result.fin_vin = allFins[0].toUpperCase()
    }
  }
  if (!result.kennzeichen) {
    const kzMatch = fullText.match(/\b([A-ZÄÖÜ]{1,3})[\s-]([A-Z]{1,2})[\s]?(\d{1,4})\b/)
    if (kzMatch) result.kennzeichen = `${kzMatch[1]}-${kzMatch[2]} ${kzMatch[3]}`
  }

  // AAR-351: Fallback-Runde für Felder die ohne Label-Match null geblieben
  // sind. Vision API liefert ZB1-Feld-Codes oft nicht auf eigenen Zeilen —
  // die Heuristiken hier springen dann als Backup ein.

  // Hersteller-Fallback: OCR-Keywords im Fließtext
  if (!result.fahrzeug_hersteller) {
    for (const { patterns, normalized } of HERSTELLER_KEYWORDS) {
      if (patterns.some((p) => p.test(fullText))) {
        result.fahrzeug_hersteller = normalized
        break
      }
    }
  }

  // Erstzulassung-Fallback: ältestes plausibles DD.MM.YYYY-Datum. Erstzulassung
  // ist per Definition älter als Ausstellungsdatum (I.1) oder TÜV-Termin —
  // daher nehmen wir das Datum mit dem frühesten Timestamp, sofern 1980..jetzt+1.
  if (!result.erstzulassung) {
    const dates = Array.from(fullText.matchAll(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g))
    const maxYear = new Date().getFullYear() + 1
    let oldest: { str: string; ts: number } | null = null
    for (const [full, dd, mm, yyyy] of dates) {
      const year = Number(yyyy)
      if (year < 1980 || year > maxYear) continue
      const ts = Date.parse(`${yyyy}-${mm}-${dd}`)
      if (Number.isNaN(ts)) continue
      if (!oldest || ts < oldest.ts) oldest = { str: full, ts }
    }
    if (oldest) result.erstzulassung = oldest.str
  }

  // Halter-Adresse-Fallback über PLZ-Anker. Deutsche PLZ sind 5-stellig +
  // Ortsname. Wir suchen die erste Zeile im Text die exakt so beginnt und
  // nehmen die Zeile davor als Straße, die Zeile zwei drüber als Name.
  // Das matcht das ZB1-Layout C.1 (Name) → C.3 (Straße) → PLZ + Ort.
  if (!result.halter_plz) {
    for (let i = 0; i < lines.length; i++) {
      const plzMatch = lines[i].match(/^(\d{5})\s+(\S.*)$/)
      if (!plzMatch) continue
      result.halter_plz = plzMatch[1]
      result.halter_stadt = plzMatch[2].trim()

      // Zeile davor = Straße (nicht wenn es ein Feld-Label wie "C.3" ist)
      if (!result.halter_strasse && i > 0) {
        const prev = lines[i - 1]
        if (prev && !/^[A-Z]\.?\d*$/i.test(prev) && prev.length > 2) {
          result.halter_strasse = prev
        }
      }

      // 2 Zeilen davor = Name (optional Vorname nach Komma)
      if (!result.halter_nachname && i > 1) {
        const nameLine = lines[i - 2]
        const isLabel = /^[A-Z]\.?\d*$/i.test(nameLine)
        const isNumeric = /^\d+$/.test(nameLine)
        if (nameLine && !isLabel && !isNumeric && nameLine.length > 1) {
          const parts = nameLine.split(/[,;]/).map((p) => p.trim()).filter(Boolean)
          if (parts.length >= 2) {
            result.halter_nachname = parts[0]
            result.halter_vorname = parts[1]
          } else {
            result.halter_nachname = nameLine
          }
        }
      }
      break
    }
  }

  // HSN-Fallback: erste 4-stellige Zahl auf eigener Zeile, die kein Jahr
  // ist (1900-2100 ausgeschlossen). ZB1 listet HSN üblicherweise als
  // Standalone-Token direkt nach Feld "2.1".
  if (!result.hsn) {
    for (const line of lines) {
      const m = line.match(/^(\d{4})$/)
      if (!m) continue
      const n = Number(m[1])
      if (n >= 1900 && n <= 2100) continue
      result.hsn = m[1]
      break
    }
  }

  // AAR-181: Baujahr aus Erstzulassung ableiten (DD.MM.YYYY → YYYY)
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

/**
 * Ruft die Google Cloud Vision API auf und liefert den extrahierten Rohtext +
 * geparste ZB1-Felder zurück. Wird sowohl vom Fall-API-Endpoint als auch vom
 * Twilio-Inbound-Webhook (AAR-182 Lead-Pfad) genutzt.
 */
export async function runZB1Ocr(base64Image: string): Promise<{
  fullText: string
  extracted: ZB1ExtractedData
} | { error: string; status?: number }> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY
  if (!apiKey) return { error: 'GOOGLE_VISION_API_KEY nicht konfiguriert', status: 500 }

  // Strip data URI prefix if present
  const payload = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image

  // AAR-350: fetch() in try/catch — DNS-Fehler, Timeout oder abgeschaltete
  // Vision-API haben bisher die komplette Server-Action crashen lassen.
  let response: Response
  try {
    response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: payload },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      },
    )
  } catch (err) {
    console.error(
      '[AAR-350] Vision API fetch crashed:',
      err instanceof Error ? err.message : err,
    )
    return {
      error: `Netzwerk-Fehler Vision API: ${err instanceof Error ? err.message : 'Unbekannt'}`,
      status: 502,
    }
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '<kein Body>')
    console.error('[AAR-182] Vision API error:', errText)
    return { error: `Google Vision API Fehler: ${response.status}`, status: 502 }
  }
  // AAR-350: JSON-Parse ebenfalls defensiv — eine HTML-Fehlerseite (bei
  // Proxy-/Gateway-Fehlern keine Seltenheit) würde sonst die Action crashen.
  let data: unknown
  try {
    data = await response.json()
  } catch (err) {
    console.error(
      '[AAR-350] Vision API JSON-Parse crashed:',
      err instanceof Error ? err.message : err,
    )
    return {
      error: `Vision API lieferte ungültiges JSON: ${err instanceof Error ? err.message : 'Unbekannt'}`,
      status: 502,
    }
  }
  const fullText =
    (data as { responses?: Array<{ fullTextAnnotation?: { text?: string } }> })
      .responses?.[0]?.fullTextAnnotation?.text ?? ''
  const extracted = parseZB1Fields(fullText)
  return { fullText, extracted }
}
