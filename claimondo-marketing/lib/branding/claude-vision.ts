// AAR-420: Claude-Vision Logo-Analyse.
//
// V2 (2026-05-14): Claude bekommt Logo + die vollständige Vibrant-Kandidaten-
// Liste und WÄHLT primary + secondary aus dieser Liste. Vorher hat Claude nur
// die schon extrahierte Primary bewertet und konnte eine alternative HEX
// vorschlagen — das hat bei fronius/gall versagt, weil Vibrant das Dominant-
// Grau lieferte und Claude nicht aktiv genug auf die kleine farbige Akzent-
// Fläche umschwenken konnte.
//
// V2-Bias (Pflicht-Regel im Prompt): "Eine kleine knallige Akzent-Farbe
// schlägt eine große neutrale Fläche". KFZ-/Werkstatt-Logos mit grauem Body
// + farbigem Detail (Flamme, Buchstabe, Emblem) sollen die Detail-Farbe als
// Brand-Primary bekommen, weil sie die emotionale Identifikation trägt.
//
// Rückgabe ist reine Metadata — extract-colors.ts wendet die Picks an und
// validiert WCAG-Kontrast danach. Bei API-Fail: graceful Fallback auf das
// reine Vibrancy-Ranking.

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'

export type ClaudeLogoAnalysis = {
  brandMood: 'sportlich' | 'edel' | 'funktional' | 'unbekannt'
  recommendedFontCategory: 'racing' | 'elegance' | 'kanoo'
  primaryColorOk: boolean
  primarySuggestion?: string
  secondarySuggestion?: string
}

const SYSTEM_FALLBACK: ClaudeLogoAnalysis = {
  brandMood: 'unbekannt',
  recommendedFontCategory: 'kanoo',
  primaryColorOk: true,
}

function buildPrompt(extractedPrimary: string, candidates: string[]): string {
  const candidateLines = candidates.map(c => `  - ${c}`).join('\n')
  return `Du bist ein Brand-Designer. Analysiere dieses Logo und wähle die zwei wichtigsten Marken-Farben.

Antworte AUSSCHLIESSLICH als JSON ohne Code-Fences:
{
  "brandMood": "sportlich" | "edel" | "funktional",
  "recommendedFontCategory": "racing" | "elegance" | "kanoo",
  "primaryColorOk": boolean,
  "primarySuggestion": "#RRGGBB",
  "secondarySuggestion": "#RRGGBB"
}

Kategorien:
- "racing": dynamisch, sportlich, kantig, energetisch (Auto/Werkstatt/Motorsport)
- "elegance": edel, serif-freundlich, Luxus, klassisch, zeitlos
- "kanoo": funktional, modern, freundlich, universell, clean sans-serif

Verfügbare Kandidaten-Farben aus dem Logo (aus Vibrant-Extraktion):
${candidateLines}

Aktuell vorgeschlagen als Primary: ${extractedPrimary}

REGELN für deine Primary/Secondary-Wahl (in dieser Reihenfolge):

1. **Akzent-Bias**: Wenn das Logo eine kleine knallige farbige Akzent-Fläche hat
   (z.B. ein farbiger Buchstabe in einer ansonsten grauen Wortmarke, eine Flamme,
   ein Emblem-Element), MUSS diese Akzent-Farbe die Primary werden — nicht das
   dominante Neutral-Grau/Schwarz/Weiß. Die Marke wird emotional über den Akzent
   identifiziert, nicht über die Trägerfläche.

2. **Neutral-Filter**: Reine Greys (Sat<10%), Near-Black, Near-White und Beige-
   Töne dürfen NIEMALS die Primary werden, AUSSER das Logo besteht ausschließlich
   aus solchen Tönen (echtes Monochrom-Branding wie z.B. Vogue, Chanel-typografie).

3. **Quelle**: primarySuggestion + secondarySuggestion MÜSSEN aus der Kandidaten-
   Liste oben stammen ODER eine offensichtlich präzisere Variante der dominanten
   Logo-Farbe sein (z.B. wenn die Liste #E3CC19 enthält aber das wahre Logo-Gelb
   #F5C800 ist — dann gib das wahre an).

4. **Secondary-Wahl**: Die Secondary soll als Text-Kontrast-Farbe taugen — daher
   eine deutlich dunklere oder hellere Variante mit klarer Distinktion zur Primary.
   Bei einfarbigen Akzent-Logos (nur ein Brand-Ton + Neutralen) wähle den dunkelsten
   Neutral-Ton als Secondary.

5. **primaryColorOk**: false setzen wenn deine primarySuggestion sich vom aktuellen
   Vorschlag ${extractedPrimary} unterscheidet. true wenn ${extractedPrimary} bereits
   die richtige Wahl ist.

Beispiele:
- KARpro-Logo (Anthrazit "KAR" + Gelb "pro"): primary=#F5C800 (Gelb-Akzent),
  secondary=#3C3C3C (Anthrazit). Gelb schlägt Anthrazit obwohl Anthrazit mehr Fläche hat.
- fronius-Logo (grünes "f" + grauer Schriftzug): primary=Grün, secondary=Grau.
  Grün ist der emotionale Akzent.
- BMW-Logo (Blau + Weiß + Schwarz Kreis): primary=BMW-Blau, secondary=Schwarz.
- Wenn das Logo komplett monochrom anthrazit ist: primary=Anthrazit, secondary=helleres Grau.`
}

function parseResponse(raw: string): ClaudeLogoAnalysis | null {
  // Claude liefert manchmal mit Markdown-Code-Fence trotz Prompt. Defensive.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>

  const mood = p.brandMood
  const cat = p.recommendedFontCategory
  const ok = p.primaryColorOk
  const sugg = p.primarySuggestion
  const secSugg = p.secondarySuggestion

  if (typeof mood !== 'string' || !['sportlich', 'edel', 'funktional'].includes(mood)) return null
  if (typeof cat !== 'string' || !['racing', 'elegance', 'kanoo'].includes(cat)) return null
  if (typeof ok !== 'boolean') return null

  const result: ClaudeLogoAnalysis = {
    brandMood: mood as ClaudeLogoAnalysis['brandMood'],
    recommendedFontCategory: cat as ClaudeLogoAnalysis['recommendedFontCategory'],
    primaryColorOk: ok,
  }
  if (typeof sugg === 'string' && /^#[0-9A-Fa-f]{6}$/.test(sugg)) {
    result.primarySuggestion = sugg.toUpperCase()
  }
  if (typeof secSugg === 'string' && /^#[0-9A-Fa-f]{6}$/.test(secSugg)) {
    result.secondarySuggestion = secSugg.toUpperCase()
  }
  return result
}

export async function analyzeLogo(
  imageUrl: string,
  extractedPrimary: string,
  candidates: string[] = [],
): Promise<ClaudeLogoAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[AAR-420] ANTHROPIC_API_KEY fehlt — graceful fallback')
    return SYSTEM_FALLBACK
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: AI_MODELS.vision_branding,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: imageUrl },
            },
            { type: 'text', text: buildPrompt(extractedPrimary, candidates) },
          ],
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const parsed = parseResponse(text)
    if (!parsed) {
      console.warn('[AAR-420] Claude-Response nicht parsebar:', text.slice(0, 200))
      return SYSTEM_FALLBACK
    }
    return parsed
  } catch (err) {
    console.error('[AAR-420] Claude-Vision-Call fehlgeschlagen:', err)
    return SYSTEM_FALLBACK
  }
}
