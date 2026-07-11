// Schadenbild-KI-Klassifizierung: Ableitung der Reparatur-Gewerke aus
// Schadensfotos via Claude Vision (Haiku 4.5, gleiche Konstante wie
// analyze-unfallfotos.ts). Fail-safe: Client null / keine URLs / Parse-Fehler
// / leere Kategorien -> { kategorien: [], confidence: 0 } (nie falsch-positiv filtern).

import type { Gewerk } from './types'
import { istGewerk } from './types'
import { getAnthropicVisionClient, buildImageBlocks } from '@/lib/ai/vision/client'
import { AI_MODELS } from '@/lib/ai/models'

const MODEL = AI_MODELS.vision_schadenbeschreibung

const SYSTEM =
  'Du bist ein KFZ-Schadengutachter-Assistent. Bestimme aus den Schadenfotos, welche Reparatur-Gewerke noetig sind.'

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

export async function klassifiziereSchadenbild(
  urls: string[],
): Promise<{ kategorien: Gewerk[]; confidence: number }> {
  const client = getAnthropicVisionClient()
  if (!client || urls.length === 0) return { kategorien: [], confidence: 0 }
  try {
    const blocks = buildImageBlocks(urls, 8)
    if (blocks.length === 0) return { kategorien: [], confidence: 0 }
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            ...blocks,
            {
              type: 'text',
              text: 'Welche Gewerke braucht dieser Schaden? Erlaubt: karosserie, lackierung, mechanik, glas, smart_repair. Antworte NUR JSON: {"kategorien":[...],"confidence":0-100}',
            },
          ],
        },
      ],
    })
    const text =
      (res.content.find((c: { type: string }) => c.type === 'text') as { text?: string } | undefined)?.text ?? ''
    const parsed = parseJson(text)
    const kategorien = (Array.isArray(parsed?.kategorien) ? parsed!.kategorien : []).filter(istGewerk) as Gewerk[]
    const confidence = kategorien.length ? clamp(Number(parsed?.confidence) || 0, 0, 100) : 0
    return { kategorien, confidence }
  } catch {
    return { kategorien: [], confidence: 0 }
  }
}
