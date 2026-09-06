// Text-KI-Schadenklassifikator: leitet Reparatur-Gewerke aus einer Freitext-
// Schadenbeschreibung ab (Claude Haiku 4.5). Analog schadenbild-gewerke.ts, aber
// Text-Content statt Image-Blocks. Fail-safe: kein Client / leerer Text / Parse-
// Fehler / leere Kategorien -> { kategorien: [], confidence: 0 } (nie falsch-positiv).
import type { Gewerk } from './types'
import { istGewerk } from './types'
import { getAnthropicVisionClient } from '@/lib/ai/vision/client'
import { AI_MODELS } from '@/lib/ai/models'

const MODEL = AI_MODELS.vision_schadenbeschreibung
const SYSTEM =
  'Sie sind ein KFZ-Schadengutachter-Assistent. Bestimmen Sie aus der Schadenbeschreibung, welche Reparatur-Gewerke noetig sind.'
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

function parseJson(text: string): { kategorien?: unknown; confidence?: unknown } | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

export async function klassifiziereSchadenbeschreibung(
  beschreibung: string,
): Promise<{ kategorien: Gewerk[]; confidence: number }> {
  const text = beschreibung?.trim()
  if (!text) return { kategorien: [], confidence: 0 }
  const client = getAnthropicVisionClient()
  if (!client) return { kategorien: [], confidence: 0 }
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `Schadenbeschreibung: "${text}"\n\n` +
                'Welche Gewerke braucht dieser Schaden? Erlaubt: karosserie, lackierung, mechanik, glas, smart_repair. ' +
                'Antworte NUR JSON: {"kategorien":[...],"confidence":0-100}',
            },
          ],
        },
      ],
    })
    const out =
      (res.content.find((c: { type: string }) => c.type === 'text') as { text?: string } | undefined)?.text ?? ''
    const parsed = parseJson(out)
    const kategorien = (Array.isArray(parsed?.kategorien) ? parsed!.kategorien : []).filter(istGewerk) as Gewerk[]
    const confidence = kategorien.length ? clamp(Number(parsed?.confidence) || 0, 0, 100) : 0
    return { kategorien, confidence }
  } catch {
    return { kategorien: [], confidence: 0 }
  }
}
