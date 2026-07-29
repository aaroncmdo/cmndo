// src/lib/linkedin/compose.ts
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import type { LinkedInFeedItem } from './types'
import { hashtagsFor } from './hashtags'

const MAX = 3000

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'
}

/** Deterministic fallback post (no LLM). Used when the LLM call fails. */
export function composeTemplate(item: LinkedInFeedItem): string {
  const facts = item.keyFacts.slice(0, 3).map((f) => `• ${f}`).join('\n')
  const tags = hashtagsFor(item.assetType).join(' ')
  const body = [
    item.title,
    '',
    item.excerpt,
    facts ? facts : '',
    '',
    `Mehr dazu: ${item.url}`,
    '',
    tags,
  ].filter((p) => p !== '').join('\n')
  return clamp(body, MAX)
}

export type GenerateFn = (prompt: string) => Promise<string>

function buildPrompt(item: LinkedInFeedItem): string {
  return [
    'Schreibe einen LinkedIn-Beitrag (Deutsch, korrekte Umlaute) für die Claimondo-Unternehmensseite.',
    'Claimondo ist eine digitale Kfz-Schadensregulierungs-Plattform. Ton: sachlich-kompetent, kein reißerischer Werbeslang (Rechts-Content).',
    'Struktur: starke erste Zeile (Hook), 2–3 prägnante Sätze Mehrwert, weicher CTA, dann die URL in eigener Zeile.',
    'Maximal ~1000 Zeichen. Keine erfundenen Fakten — nur die gegebenen.',
    '',
    `Titel: ${item.title}`,
    `Zusammenfassung: ${item.excerpt}`,
    `Key Facts:\n${item.keyFacts.map((f) => `- ${f}`).join('\n')}`,
    `URL: ${item.url}`,
  ].join('\n')
}

async function generateWithClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing')
  const client = new Anthropic({ apiKey })
  const res = await client.messages.create({
    model: AI_MODELS.linkedin_compose,
    max_tokens: 700,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = res.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}

/** LLM-composed post with deterministic template fallback. Never throws. */
export async function composePost(
  item: LinkedInFeedItem,
  deps: { generate?: GenerateFn } = {},
): Promise<string> {
  const generate = deps.generate ?? generateWithClaude
  try {
    const raw = (await generate(buildPrompt(item))).trim()
    if (!raw) return composeTemplate(item)
    const withLink = raw.includes(item.url) ? raw : `${raw}\n\n${item.url}`
    return clamp(withLink, MAX)
  } catch {
    return composeTemplate(item)
  }
}
