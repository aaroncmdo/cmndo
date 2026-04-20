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
}

/**
 * OCR-Pipeline: extrahiert TBNRs aus einem Polizeibericht-Bild.
 * Returns source='ocr' wenn mindestens eine valide TBNR gefunden wurde.
 */
export async function inferBkatFromPolizeibericht(
  bildUrls: string[],
): Promise<BkatInferenzErgebnis> {
  if (bildUrls.length === 0) {
    return { source: 'keine_daten', unfallart: null, vorschlaege: [] }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { source: 'keine_daten', unfallart: null, vorschlaege: [] }
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
        'Du bist ein OCR-Assistent für deutsche Polizeiberichte. Deine einzige Aufgabe: ' +
        'Extrahiere alle 6-stelligen Tatbestandsnummern (TBNR) die im Bericht genannt werden. ' +
        'TBNR-Format: [1-9][0-9]{5}. Antwort NUR als JSON: {"tbnrs":["123456","234567"]}. ' +
        'Wenn keine TBNR gefunden: {"tbnrs":[]}.',
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: 'Extrahiere alle TBNRs aus diesem Polizeibericht.' },
          ],
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text : ''
    const match = raw.match(/\{[\s\S]*"tbnrs"[\s\S]*\}/)
    if (!match) return { source: 'keine_daten', unfallart: null, vorschlaege: [] }

    const parsed = JSON.parse(match[0]) as { tbnrs?: string[] }
    const tbnrs = Array.isArray(parsed.tbnrs) ? parsed.tbnrs : []
    if (tbnrs.length === 0) {
      return { source: 'keine_daten', unfallart: null, vorschlaege: [] }
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
    }
  } catch (err) {
    console.error('[AAR-504] OCR-Inferenz fehlgeschlagen:', err)
    return { source: 'keine_daten', unfallart: null, vorschlaege: [] }
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
    return { source: 'keine_daten', unfallart: null, vorschlaege: [] }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { source: 'keine_daten', unfallart: null, vorschlaege: [] }
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
    if (!match) return { source: 'keine_daten', unfallart: null, vorschlaege: [] }

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
    }
  } catch (err) {
    console.error('[AAR-505] LLM-Inferenz fehlgeschlagen:', err)
    return { source: 'keine_daten', unfallart: null, vorschlaege: [] }
  }
}

/**
 * Kombinierter Workflow: versucht zuerst OCR, fällt auf LLM zurück wenn OCR
 * leer oder keine Polizeibilder vorhanden. Konsument ist die Dispatcher-UI.
 */
export async function inferBkat(input: {
  polizeibericht_urls?: string[]
  unfallhergang?: string | null
}): Promise<BkatInferenzErgebnis> {
  const bilder = input.polizeibericht_urls ?? []
  if (bilder.length > 0) {
    const ocr = await inferBkatFromPolizeibericht(bilder)
    if (ocr.source === 'ocr' && ocr.vorschlaege.length > 0) return ocr
  }
  return inferBkatFromHergangText(input.unfallhergang ?? '')
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

// Re-export für konsumenten-UI
export { extractTbnrsFromText }
