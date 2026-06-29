// src/lib/linkedin/compose.ts
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
    facts ? `\n${facts}` : '',
    '',
    `Mehr dazu: ${item.url}`,
    '',
    tags,
  ].filter((p) => p !== '').join('\n')
  return clamp(body, MAX)
}
