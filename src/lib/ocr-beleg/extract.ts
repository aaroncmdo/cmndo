// AAR-761: Beleg-OCR via Claude-Vision (Sonnet 4.6). Nimmt Base64-Bild
// oder URL + Typ, gibt BelegExtraktion zurück.

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import { buildPromptForTyp } from './prompts'
import type { BelegOcrResult, BelegTyp, BelegExtraktion } from './types'

const MODEL = AI_MODELS.ocr

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return new Anthropic({ apiKey })
}

type ExtractInput = {
  typ: BelegTyp
  /** Base64 (mit oder ohne data:-Prefix) ODER http(s)-URL */
  image: string
}

function countNonNullFields(obj: Record<string, unknown>): number {
  let count = 0
  for (const v of Object.values(obj)) {
    if (v === null || v === undefined) continue
    if (Array.isArray(v)) {
      if (v.length > 0) count++
      continue
    }
    count++
  }
  return count
}

function cleanJsonString(s: string): string {
  // Entfernt Markdown-Codefences falls das Modell sie doch ausgibt
  const trimmed = s.trim()
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  }
  return trimmed
}

function parseMediaType(image: string): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (image.startsWith('data:image/jpeg')) return 'image/jpeg'
  if (image.startsWith('data:image/png')) return 'image/png'
  if (image.startsWith('data:image/webp')) return 'image/webp'
  return 'image/jpeg' // Default
}

function stripDataPrefix(image: string): string {
  const idx = image.indexOf('base64,')
  if (idx >= 0) return image.slice(idx + 'base64,'.length)
  return image
}

export async function extractBeleg({ typ, image }: ExtractInput): Promise<BelegOcrResult> {
  const client = getClient()
  if (!client) {
    return {
      success: false,
      typ,
      extracted: null,
      fields_found: 0,
      error: 'ANTHROPIC_API_KEY nicht gesetzt',
    }
  }

  const isUrl = /^https?:\/\//.test(image)

  try {
    const imageBlock: Anthropic.ImageBlockParam = isUrl
      ? { type: 'image', source: { type: 'url', url: image } }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: parseMediaType(image) ?? 'image/jpeg',
            data: stripDataPrefix(image),
          },
        }

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [imageBlock, { type: 'text', text: buildPromptForTyp(typ) }],
        },
      ],
    })

    const textBlock = msg.content.find((c): c is Anthropic.TextBlock => c.type === 'text')
    if (!textBlock) {
      return {
        success: false,
        typ,
        extracted: null,
        fields_found: 0,
        error: 'Kein Text-Block in der Antwort',
      }
    }

    let parsed: BelegExtraktion | null = null
    try {
      parsed = JSON.parse(cleanJsonString(textBlock.text)) as BelegExtraktion
    } catch (err) {
      return {
        success: false,
        typ,
        extracted: null,
        fields_found: 0,
        raw_text: textBlock.text,
        error: `JSON-Parse fehlgeschlagen: ${err instanceof Error ? err.message : 'unknown'}`,
      }
    }

    // Typ zuweisen falls das Modell ihn nicht gesetzt hat
    if (parsed && !parsed.typ) {
      parsed = { ...(parsed as object), typ } as BelegExtraktion
    }

    const fields_found = countNonNullFields(parsed as unknown as Record<string, unknown>)

    return { success: true, typ, extracted: parsed, fields_found }
  } catch (err) {
    return {
      success: false,
      typ,
      extracted: null,
      fields_found: 0,
      error: err instanceof Error ? err.message : 'unknown',
    }
  }
}
