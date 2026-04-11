// KFZ-200: OCR via Google Cloud Vision API.

export interface OcrResult {
  fullText: string
  confidence?: number
}

export interface KfzScheinData {
  fin?: string
  kennzeichen?: string
  hersteller?: string
  modell?: string
  erstzulassung?: string
  fahrzeugklasse?: string
}

/**
 * Extrahiert Text aus einem Bild via Google Cloud Vision API.
 * imageBase64: base64-kodiertes Bild (ohne data:-prefix).
 */
export async function extractText(imageBase64: string): Promise<OcrResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY
  if (!apiKey) {
    console.warn('[OCR] GOOGLE_VISION_API_KEY not set — OCR skipped')
    return { fullText: '' }
  }

  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      }
    )

    if (!res.ok) {
      console.error('[OCR] Vision API error:', res.status, await res.text())
      return { fullText: '' }
    }

    const data = await res.json()
    const annotation = data.responses?.[0]?.fullTextAnnotation
    const textAnnotations = data.responses?.[0]?.textAnnotations

    if (annotation?.text) {
      return { fullText: annotation.text }
    }
    if (textAnnotations?.[0]?.description) {
      return { fullText: textAnnotations[0].description }
    }
    return { fullText: '' }
  } catch (err) {
    console.error('[OCR] extractText error:', err)
    return { fullText: '' }
  }
}

/**
 * Extrahiert FIN, Kennzeichen und weitere Felder aus einem KFZ-Schein-Bild.
 */
export async function extractFromKfzSchein(imageBase64: string): Promise<KfzScheinData> {
  const { fullText } = await extractText(imageBase64)
  if (!fullText) return {}

  const result: KfzScheinData = {}

  // FIN: 17-stellige alphanumerische Kennung (keine I, O, Q)
  const finMatch = fullText.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)
  if (finMatch) result.fin = finMatch[1]

  // Kennzeichen: z.B. "B-AB 1234" oder "M-XY 5678"
  const kennzeichenMatch = fullText.match(/\b([A-ZÄÖÜ]{1,3}[-\s][A-Z]{1,2}\s?\d{1,4}[HE]?)\b/)
  if (kennzeichenMatch) result.kennzeichen = kennzeichenMatch[1].replace(/\s+/g, ' ').trim()

  // Erstzulassung: Datum im Format TT.MM.JJJJ
  const datumMatch = fullText.match(/\b(\d{2}\.\d{2}\.\d{4})\b/)
  if (datumMatch) result.erstzulassung = datumMatch[1]

  // Fahrzeugklasse (z.B. M1, N1)
  const klasseMatch = fullText.match(/\b([MNL][0-9][a-z]?)\b/)
  if (klasseMatch) result.fahrzeugklasse = klasseMatch[1]

  // Hersteller / Marke (nach "Marke" oder "Hersteller" Label)
  const herstellerMatch = fullText.match(/(?:Marke|Hersteller|Make)[:\s]+([A-Z][a-zA-Z\-]+)/i)
  if (herstellerMatch) result.hersteller = herstellerMatch[1]

  return result
}

/**
 * Extrahiert nur die FIN aus einem Bild (z.B. FIN-Foto oder KFZ-Schein).
 */
export async function extractFin(imageBase64: string): Promise<string | null> {
  const { fullText } = await extractText(imageBase64)
  if (!fullText) return null
  const match = fullText.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)
  return match ? match[1] : null
}
