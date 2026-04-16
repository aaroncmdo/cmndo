// AAR-317 MVP: Unfallskizze via Claude-API. Generiert ein einfaches SVG
// mit Fahrzeug-Symbolen + Pfeilen basierend auf unfallhergang + schadentyp.
// Animation (GIF) ist Follow-up — MVP speichert das rohe SVG als Inline-String.

import Anthropic from '@anthropic-ai/sdk'

export type UnfallskizzeInput = {
  unfallhergang: string | null
  schadentyp: string | null
  gegnerFahrzeugtyp?: string | null
}

export type UnfallskizzeResult =
  | { success: true; svg: string }
  | { success: false; error: string }

const SYSTEM_PROMPT = `Du bist ein technischer Illustrator der einfache
Unfall-Skizzen als SVG rendert. Du bekommst den Unfall-Hergang als Freitext
plus optional den Unfalltyp. Du antwortest AUSSCHLIESSLICH mit einem
validen SVG-Dokument — kein Markdown, kein Erklärungstext, keine Backticks.

Stil:
- viewBox "0 0 600 400"
- weiße Hintergrundfläche
- Fahrzeuge als abstrakte Rechtecke mit abgerundeten Ecken (rx=8)
- Fahrzeug-Beschriftungen "A" (Kunde) und "B" (Gegner) zentriert im Rechteck
- Bewegungs-Pfeile in dunkelgrau (#4573A2) mit arrowhead-Marker
- Straßen-/Kreuzungs-Linien in hellgrau (#ccc, stroke-dasharray="4,4")
- Farben: Kunde-Fahrzeug #0D1B3E, Gegner-Fahrzeug #b33, Text weiß
- Keine Schatten, keine Gradients, keine Bilder — nur Grundformen + Text
- Kompakt: max. 3 KB, keine überflüssigen Kommentare im SVG

Wenn der Hergang widersprüchlich oder leer ist: zeichne eine generische
Auffahrunfall-Darstellung (Auto B fährt von hinten auf Auto A).`

const TYP_LABELS: Record<string, string> = {
  auffahrunfall: 'Auffahrunfall (Gegner fährt von hinten auf)',
  spurwechsel: 'Spurwechsel-Unfall',
  vorfahrtsverletzung: 'Vorfahrtsverletzung an Kreuzung',
  parkplatz: 'Parkplatz-Schaden',
  sonstiges: 'Sonstiger Verkehrsunfall',
}

export async function generateUnfallskizze(
  input: UnfallskizzeInput,
): Promise<UnfallskizzeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { success: false, error: 'ANTHROPIC_API_KEY nicht gesetzt' }
  }

  const hergang = (input.unfallhergang ?? '').trim()
  const typLabel = input.schadentyp ? TYP_LABELS[input.schadentyp] ?? input.schadentyp : '—'
  const gegner = input.gegnerFahrzeugtyp ?? 'PKW'

  if (!hergang && !input.schadentyp) {
    return { success: false, error: 'Weder Unfallhergang noch Schadentyp gesetzt' }
  }

  const prompt = [
    `Unfalltyp: ${typLabel}`,
    `Gegner-Fahrzeugtyp: ${gegner}`,
    `Hergang (wörtlich vom Kunden):`,
    hergang || '(leer — bitte generisch für den Unfalltyp zeichnen)',
    '',
    'Bitte erzeuge jetzt das SVG. Antworte NUR mit dem <svg>...</svg>-Element.',
  ].join('\n')

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const svg = extractSvg(raw)
    if (!svg) return { success: false, error: 'Claude hat kein valides SVG geliefert' }
    return { success: true, svg }
  } catch (err) {
    console.error('[AAR-317] Claude-API fehlgeschlagen:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Claude-API-Fehler',
    }
  }
}

/** Extrahiert das <svg>...</svg>-Element aus einem freien Text-Output. */
function extractSvg(text: string): string | null {
  const match = text.match(/<svg[\s\S]*?<\/svg>/i)
  if (!match) return null
  return match[0].trim()
}
