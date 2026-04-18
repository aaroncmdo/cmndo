// AAR-420: Claude-Vision Logo-Analyse.
//
// Wird aus extract-colors.ts aufgerufen nach der Vibrant-Extraktion. Schickt
// das Logo + die extrahierte Primary-Farbe an Claude Sonnet 4 und fragt:
//   - Brand-Mood (sportlich/edel/funktional)?
//   - Empfohlene Font-Kategorie (racing/elegance/kanoo)?
//   - Ist die Primary-Farbe "die richtige" (kein Hintergrund-Weißpunkt)?
//   - Falls nicht: Vorschlag für die echte Primary-Farbe
//
// Rückgabe ist reine Metadata — das finale Theme wird in extract-colors.ts
// zusammengebaut. Falls der API-Call fehlschlägt, returned die Funktion einen
// graceful-Degradation-Default ('unbekannt' mood, 'kanoo' category).

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'

export type ClaudeLogoAnalysis = {
  brandMood: 'sportlich' | 'edel' | 'funktional' | 'unbekannt'
  recommendedFontCategory: 'racing' | 'elegance' | 'kanoo'
  primaryColorOk: boolean
  primarySuggestion?: string
}

const SYSTEM_FALLBACK: ClaudeLogoAnalysis = {
  brandMood: 'unbekannt',
  recommendedFontCategory: 'kanoo',
  primaryColorOk: true,
}

function buildPrompt(extractedPrimary: string): string {
  return `Analysiere dieses Logo. Antworte AUSSCHLIESSLICH als JSON ohne Code-Fences:
{
  "brandMood": "sportlich" | "edel" | "funktional",
  "recommendedFontCategory": "racing" | "elegance" | "kanoo",
  "primaryColorOk": boolean,
  "primarySuggestion": "#RRGGBB"
}

Kategorien:
- "racing": dynamisch, sportlich, kantig, energetisch
- "elegance": edel, serif-freundlich, Luxus, klassisch, zeitlos
- "kanoo": funktional, modern, freundlich, universell, sans-serif clean

"primarySuggestion" nur setzen wenn primaryColorOk=false (sonst leeren String).

Extrahierte Primary-Farbe aus dem Logo: ${extractedPrimary}

Bewerte ob ${extractedPrimary} wirklich die dominante Logo-Farbe ist oder ob
die Extraktion eine Hintergrund-Farbe (zB Weiß/Schwarz vom Canvas) erwischt
hat. Wenn letzteres: primaryColorOk=false und die echte Logo-Haupt-Farbe als
primarySuggestion angeben.`
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

  if (typeof mood !== 'string' || !['sportlich', 'edel', 'funktional'].includes(mood)) return null
  if (typeof cat !== 'string' || !['racing', 'elegance', 'kanoo'].includes(cat)) return null
  if (typeof ok !== 'boolean') return null

  const result: ClaudeLogoAnalysis = {
    brandMood: mood as ClaudeLogoAnalysis['brandMood'],
    recommendedFontCategory: cat as ClaudeLogoAnalysis['recommendedFontCategory'],
    primaryColorOk: ok,
  }
  if (!ok && typeof sugg === 'string' && /^#[0-9A-Fa-f]{6}$/.test(sugg)) {
    result.primarySuggestion = sugg.toUpperCase()
  }
  return result
}

export async function analyzeLogo(
  imageUrl: string,
  extractedPrimary: string,
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
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: imageUrl },
            },
            { type: 'text', text: buildPrompt(extractedPrimary) },
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
