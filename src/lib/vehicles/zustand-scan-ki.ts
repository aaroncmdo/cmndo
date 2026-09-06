// B (Fahrzeug-Zustandsdoku) Task 3: KI-Analyse. Parser (pure, tolerant) + Vision-Wrapper
// (fail-safe) nach dem schadenbild-gewerke.ts-Muster. Nie falsch-positiv: Client null /
// keine Fotos / Parse-Fehler / unbekannte Schwere -> leere Fund-Liste.
import { getAnthropicVisionClient, buildImageBlocks } from '@/lib/ai/vision/client'
import { AI_MODELS } from '@/lib/ai/models'

export type ZustandFund = {
  perspektive: string
  bereich: string
  art: string
  schwere: 'leicht' | 'mittel' | 'schwer'
  confidence: number
  beschreibung: string
}

const SCHWERE = new Set(['leicht', 'mittel', 'schwer'])
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** Pure, tolerant: extrahiert das erste JSON-Objekt aus dem Text und mappt {funde:[…]} auf
 *  ZustandFund[]. Malformed / unbekannte Schwere -> Fund verworfen (nie throw, nie falsch-positiv). */
export function parseFunde(text: string): ZustandFund[] {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return []
  let parsed: { funde?: unknown }
  try {
    parsed = JSON.parse(m[0])
  } catch {
    return []
  }
  const raw = Array.isArray(parsed?.funde) ? parsed.funde : []
  return raw.flatMap((f: unknown): ZustandFund[] => {
    if (!f || typeof f !== 'object') return []
    const o = f as Record<string, unknown>
    const schwere = String(o.schwere ?? '')
    if (!SCHWERE.has(schwere)) return []
    return [
      {
        perspektive: String(o.perspektive ?? ''),
        bereich: String(o.bereich ?? ''),
        art: String(o.art ?? ''),
        schwere: schwere as ZustandFund['schwere'],
        confidence: clamp(Number(o.confidence) || 0, 0, 100),
        beschreibung: String(o.beschreibung ?? ''),
      },
    ]
  })
}

const SYSTEM =
  'Sie sind ein KFZ-Schadengutachter. Erkenne aus den Fahrzeugfotos NUR eindeutig sichtbare Schäden (Delle, Kratzer, Riss, Rost, Bruch).'

/** Fail-safe Vision-Call: bei fehlendem Client / keinen Fotos / Fehler -> []. */
export async function analysiereFotos(fotos: { url: string; perspektive: string }[]): Promise<ZustandFund[]> {
  const client = getAnthropicVisionClient()
  if (!client || fotos.length === 0) return []
  try {
    const res = await client.messages.create({
      model: AI_MODELS.vision_schadenbeschreibung,
      max_tokens: 800,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            ...buildImageBlocks(
              fotos.map((f) => f.url),
              10,
            ),
            {
              type: 'text' as const,
              text: `Perspektiven in Reihenfolge: ${fotos.map((f) => f.perspektive).join(', ')}. Antworte NUR JSON: {"funde":[{"perspektive","bereich","art","schwere":"leicht|mittel|schwer","confidence":0-100,"beschreibung"}]}. Keine Funde -> {"funde":[]}.`,
            },
          ],
        },
      ],
    })
    const textBlock = res.content.find((c) => c.type === 'text')
    const text = textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : ''
    return parseFunde(text)
  } catch {
    return []
  }
}
