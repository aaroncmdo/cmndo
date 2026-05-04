// AAR-504/505 (B2+B3): BKat-Inferenz. Zwei Quellen:
//
// 1. OCR-Pipeline: Polizeibericht-Foto/PDF → Claude Vision extrahiert TBNRs
//    direkt aus dem Text. Hoch-konfident (die Polizei hat sie selbst notiert).
// 2. LLM-Fallback: `unfallhergang`-Text (Dispatcher-Eingabe) → Claude
//    analysiert + schlägt 1-3 TBNR-Vorschläge vor. Niedriger-konfident, nur
//    als Hint für den Dispatcher.
//
// WICHTIG: Die TBNRs werden NICHT auf Lead/Fall persistiert wenn die Polizei
// nicht vor Ort war. TBNR = Tatbestandsnummer = offizielles Dokument. Wenn
// wir ohne Polizei-Involvement eine TBNR speichern, stiften wir bei der
// Kanzlei Verwirrung (sie liest TBNR = „Polizei hat das festgestellt"). Wir
// speichern nur die abgeleitete `bkat_unfallart` als schadentyp.

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import {
  extractTbnrsFromText,
  lookupTbnr,
  type BkatTatbestand,
  type BkatUnfallart,
} from './lookup'

export type TbnrVorschlag = {
  tbnr: string
  tatbestand: BkatTatbestand
  confidence: 'hoch' | 'mittel' | 'niedrig'
  begruendung: string
}

export type BkatInferenzErgebnis = {
  source: 'ocr' | 'llm' | 'keine_daten'
  unfallart: BkatUnfallart | null
  /** 1-3 Vorschläge, sortiert nach Confidence. Nur anzeigen im UI, nicht
   *  in DB speichern ausser polizei_vor_ort=true + OCR-Quelle. */
  vorschlaege: TbnrVorschlag[]
  /** Wenn OCR aus Polizeibericht: alle gefundenen TBNRs (auch die ohne
   *  Unfallrelevanz). Für Kanzlei-Archiv interessant. */
  alle_gefundenen_tbnrs?: string[]
  /** Zusammengefasste Schuld-Einschätzung für UI-Badge. */
  schuld_hint?: 'gegner_klar' | 'gegner_wahrscheinlich' | 'geteilt' | 'kunde_verdacht' | null
  /** Polizeiliches Aktenzeichen — aus Vision wenn eindeutig lesbar, sonst aus unfallhergang. */
  aktenzeichen: string | null
  /** Woher das Aktenzeichen stammt. */
  aktenzeichen_quelle: 'vision' | 'hergang' | null
}

/**
 * OCR-Pipeline: extrahiert TBNRs aus einem Polizeibericht-Bild.
 * Returns source='ocr' wenn mindestens eine valide TBNR gefunden wurde.
 */
export async function inferBkatFromPolizeibericht(
  bildUrls: string[],
): Promise<BkatInferenzErgebnis> {
  if (bildUrls.length === 0) {
    return { source: 'keine_daten', unfallart: null, vorschlaege: [], aktenzeichen: null, aktenzeichen_quelle: null }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { source: 'keine_daten', unfallart: null, vorschlaege: [], aktenzeichen: null, aktenzeichen_quelle: null }
  }

  try {
    const client = new Anthropic({ apiKey })
    const imageBlocks = bildUrls.slice(0, 4).map((url) => ({
      type: 'image' as const,
      source: { type: 'url' as const, url },
    }))

    const response = await client.messages.create({
      model: AI_MODELS.bkat_ocr,
      max_tokens: 1024,
      system:
        'Du bist ein OCR-Assistent für deutsche Polizeiberichte. Extrahiere:\n' +
        '1. Alle 6-stelligen Tatbestandsnummern / Behördenkennungen (TBNR, Format [1-9][0-9]{5}).\n' +
        '   Setze tbnrs_eindeutig auf true NUR wenn du die Ziffern klar lesen kannst.\n' +
        '2. Das polizeiliche Aktenzeichen (z.B. "3 BM 123456/24", "VP-1234/24").\n' +
        '   Setze aktenzeichen_lesbar auf true nur wenn du es eindeutig lesen kannst.\n' +
        'Antwort NUR als JSON:\n' +
        '{"tbnrs":["123456"],"tbnrs_eindeutig":true,"aktenzeichen":"3 BM 123456/24","aktenzeichen_lesbar":true}\n' +
        'Wenn keine TBNR lesbar: "tbnrs":[],"tbnrs_eindeutig":false. Wenn Aktenzeichen nicht lesbar: "aktenzeichen":null,"aktenzeichen_lesbar":false.',
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: 'Extrahiere TBNRs (Behördenkennungen) und Aktenzeichen aus diesem Polizeibericht.' },
          ],
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text : ''
    const match = raw.match(/\{[\s\S]*"tbnrs"[\s\S]*\}/)
    if (!match) return { source: 'keine_daten', unfallart: null, vorschlaege: [], aktenzeichen: null, aktenzeichen_quelle: null }

    const parsed = JSON.parse(match[0]) as {
      tbnrs?: string[]
      tbnrs_eindeutig?: boolean
      aktenzeichen?: string | null
      aktenzeichen_lesbar?: boolean
    }
    const tbnrs = Array.isArray(parsed.tbnrs) ? parsed.tbnrs : []
    const tbnrsEindeutig = parsed.tbnrs_eindeutig === true && tbnrs.length > 0
    const visionAktenzeichen = parsed.aktenzeichen_lesbar && parsed.aktenzeichen
      ? parsed.aktenzeichen.trim()
      : null

    if (!tbnrsEindeutig) {
      // Vision konnte TBNRs nicht eindeutig lesen — Aufrufer (inferBkat) soll
      // Unfallhergang als Fallback nutzen.
      return { source: 'keine_daten', unfallart: null, vorschlaege: [], aktenzeichen: visionAktenzeichen, aktenzeichen_quelle: visionAktenzeichen ? 'vision' : null }
    }

    const tatbestaende = (await Promise.all(tbnrs.map(lookupTbnr))).filter(
      (t): t is BkatTatbestand => t !== null,
    )

    const unfallart = pickPrimaryUnfallart(tatbestaende)
    const vorschlaege: TbnrVorschlag[] = tatbestaende.slice(0, 3).map((t) => ({
      tbnr: t.tbnr,
      tatbestand: t,
      confidence: 'hoch',
      begruendung: `Aus Polizeibericht extrahiert (§ ${t.paragraph_num ?? '?'} ${t.vorschrift})`,
    }))

    return {
      source: 'ocr',
      unfallart,
      vorschlaege,
      alle_gefundenen_tbnrs: tbnrs,
      schuld_hint: deriveSchuldHint(tatbestaende),
      aktenzeichen: visionAktenzeichen,
      aktenzeichen_quelle: visionAktenzeichen ? 'vision' : null,
    }
  } catch (err) {
    console.error('[AAR-504] OCR-Inferenz fehlgeschlagen:', err)
    return { source: 'keine_daten', unfallart: null, vorschlaege: [], aktenzeichen: null, aktenzeichen_quelle: null }
  }
}

/**
 * LLM-Fallback: analysiert den `unfallhergang`-Text und schlägt bkat_unfallart
 * + Top-3 TBNRs vor. Nur für UI-Hint, nicht für Persistenz.
 */
export async function inferBkatFromHergangText(
  unfallhergang: string,
): Promise<BkatInferenzErgebnis> {
  const text = unfallhergang?.trim() ?? ''
  if (text.length < 20) {
    return { source: 'keine_daten', unfallart: null, vorschlaege: [], aktenzeichen: null, aktenzeichen_quelle: null }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { source: 'keine_daten', unfallart: null, vorschlaege: [], aktenzeichen: null, aktenzeichen_quelle: null }
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: AI_MODELS.bkat_inference,
      max_tokens: 512,
      system:
        'Du bist ein deutscher Verkehrsrechtsexperte. Analysiere den Unfallhergang und ' +
        'ordne ihn dem passenden BKat-Tatbestand zu. ' +
        'Mögliche Unfallarten (bkat_unfallart): auffahrunfall, vorfahrt, kreuzung_rotlicht, ' +
        'spurwechsel, ueberholen, abbiegen, rueckwaerts_parken, einfahren_anfahren, ' +
        'dooring, fussgaenger, geschwindigkeit, fahrerflucht, alkohol_drogen, ' +
        'grundregeln, sonstiges. ' +
        'Antwort NUR als JSON: {"unfallart":"auffahrunfall","tbnr_kandidaten":["104600","104601"],' +
        '"begruendung":"Kurze Erklärung warum diese Kategorie passt."}. ' +
        'Max 3 TBNR-Kandidaten. Wenn unklar: unfallart="sonstiges", tbnr_kandidaten=[].',
      messages: [
        { role: 'user', content: `Unfallhergang:\n${text}` },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text : ''
    const match = raw.match(/\{[\s\S]*?\}/)
    if (!match) return { source: 'keine_daten', unfallart: null, vorschlaege: [], aktenzeichen: null, aktenzeichen_quelle: null }

    const parsed = JSON.parse(match[0]) as {
      unfallart?: string
      tbnr_kandidaten?: string[]
      begruendung?: string
    }

    const unfallart = isValidUnfallart(parsed.unfallart) ? parsed.unfallart : null
    const tbnrs = Array.isArray(parsed.tbnr_kandidaten) ? parsed.tbnr_kandidaten : []

    const tatbestaende = (await Promise.all(tbnrs.map(lookupTbnr))).filter(
      (t): t is BkatTatbestand => t !== null,
    )

    const vorschlaege: TbnrVorschlag[] = tatbestaende.slice(0, 3).map((t) => ({
      tbnr: t.tbnr,
      tatbestand: t,
      confidence: 'mittel',
      begruendung: parsed.begruendung ?? 'KI-Analyse aus Unfallhergang',
    }))

    return {
      source: 'llm',
      unfallart,
      vorschlaege,
      schuld_hint: deriveSchuldHint(tatbestaende),
      aktenzeichen: null,
      aktenzeichen_quelle: null,
    }
  } catch (err) {
    console.error('[AAR-505] LLM-Inferenz fehlgeschlagen:', err)
    return { source: 'keine_daten', unfallart: null, vorschlaege: [], aktenzeichen: null, aktenzeichen_quelle: null }
  }
}

/**
 * Kombinierter Workflow: versucht zuerst OCR, fällt auf LLM zurück wenn OCR
 * leer oder keine Polizeibilder vorhanden. Konsument ist die Dispatcher-UI.
 *
 * Aktenzeichen-Logik:
 * - Vision liest Polizeibericht → aktenzeichen_lesbar=true → direkt nutzen
 * - Vision liest es nicht eindeutig → Regex-Fallback auf unfallhergang-Text
 */
export async function inferBkat(input: {
  polizeibericht_urls?: string[]
  unfallhergang?: string | null
}): Promise<BkatInferenzErgebnis> {
  const bilder = input.polizeibericht_urls ?? []
  const hergang = input.unfallhergang ?? ''

  if (bilder.length > 0) {
    const ocr = await inferBkatFromPolizeibericht(bilder)
    const aktenzeichen = ocr.aktenzeichen ?? extractAktenzeichenFromText(hergang)
    const aktenzeichen_quelle: BkatInferenzErgebnis['aktenzeichen_quelle'] = ocr.aktenzeichen
      ? 'vision'
      : aktenzeichen ? 'hergang' : null

    if (ocr.source === 'ocr' && ocr.vorschlaege.length > 0) {
      // Vision hat TBNRs eindeutig gelesen — direkt nutzen
      return { ...ocr, aktenzeichen, aktenzeichen_quelle }
    }

    // Vision konnte TBNRs nicht eindeutig lesen → Unfallhergang als Fallback:
    // 1. Erst explizit genannte TBNRs im Text suchen (Regex + DB-Lookup)
    // 2. Nur wenn nichts gefunden → LLM-Inferenz (rät aus dem Hergang)
    if (hergang.length >= 20) {
      // extractTbnrsFromText gibt bereits BkatTatbestand[] zurück (mit DB-Lookup)
      const tatbestaende = await extractTbnrsFromText(hergang)
      if (tatbestaende.length > 0) {
        return {
          source: 'ocr',
          unfallart: pickPrimaryUnfallart(tatbestaende),
          vorschlaege: tatbestaende.slice(0, 3).map((t) => ({
            tbnr: t.tbnr,
            tatbestand: t,
            confidence: 'mittel' as const,
            begruendung: 'TBNR aus Unfallhergang-Text extrahiert',
          })),
          alle_gefundenen_tbnrs: tatbestaende.map((t) => t.tbnr),
          schuld_hint: deriveSchuldHint(tatbestaende),
          aktenzeichen,
          aktenzeichen_quelle,
        }
      }
    }

    const llm = await inferBkatFromHergangText(hergang)
    return { ...llm, aktenzeichen, aktenzeichen_quelle }
  }

  const llm = await inferBkatFromHergangText(hergang)
  const aktenzeichen = extractAktenzeichenFromText(hergang)
  return { ...llm, aktenzeichen, aktenzeichen_quelle: aktenzeichen ? 'hergang' : null }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function isValidUnfallart(value: unknown): value is BkatUnfallart {
  const valid: BkatUnfallart[] = [
    'auffahrunfall', 'vorfahrt', 'kreuzung_rotlicht', 'spurwechsel',
    'ueberholen', 'abbiegen', 'rueckwaerts_parken', 'einfahren_anfahren',
    'dooring', 'fussgaenger', 'geschwindigkeit', 'fahrerflucht',
    'alkohol_drogen', 'grundregeln', 'sonstiges',
  ]
  return typeof value === 'string' && valid.includes(value as BkatUnfallart)
}

function pickPrimaryUnfallart(tatbestaende: BkatTatbestand[]): BkatUnfallart | null {
  for (const t of tatbestaende) {
    if (t.mit_unfall && t.unfallart) return t.unfallart
  }
  return tatbestaende[0]?.unfallart ?? null
}

function deriveSchuldHint(
  tatbestaende: BkatTatbestand[],
): BkatInferenzErgebnis['schuld_hint'] {
  if (tatbestaende.length === 0) return null
  if (tatbestaende.some((t) => t.schuldindiz === 'gegner_klar')) return 'gegner_klar'
  if (tatbestaende.some((t) => t.schuldindiz === 'gegner_wahrscheinlich'))
    return 'gegner_wahrscheinlich'
  if (tatbestaende.some((t) => t.schuldindiz === 'kunde_verdacht')) return 'kunde_verdacht'
  if (tatbestaende.some((t) => t.schuldindiz === 'geteilt')) return 'geteilt'
  return null
}

/**
 * Extrahiert das polizeiliche Aktenzeichen aus dem Unfallhergang-Text.
 * Greift wenn Vision das Aktenzeichen nicht eindeutig lesen konnte.
 * Typische deutsche Formate: "3 BM 123456/24", "VP-1234/24", "8 UJs 234/24",
 * "Az.: 1234/2024", plain "123456/24".
 */
function extractAktenzeichenFromText(text: string): string | null {
  if (!text) return null
  // Explizite Nennung: "Aktenzeichen 1234/24" oder "Az.: ..."
  const explicitMatch = text.match(
    /(?:aktenzeichen|az\.?:?)\s*([A-ZÜÄÖ\d][\w\s\/\-]{2,30}\d{2,4})/i,
  )
  if (explicitMatch) return explicitMatch[1].trim()
  // Strukturiertes Format: optionale Buchstaben + Ziffernblock + Slash/Bindestrich + Jahreszahl
  const structuredMatch = text.match(
    /\b(?:[A-ZÜÄÖ]{1,5}[-\s]?){0,2}\d{4,8}[\/\-]\d{2,4}\b/,
  )
  return structuredMatch ? structuredMatch[0].trim() : null
}

// Re-export für konsumenten-UI
export { extractTbnrsFromText }
