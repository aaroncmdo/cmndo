// src/lib/linkedin/feed-source.ts
import type { LinkedInFeedItem } from './types'

const DEFAULT_FEED_URL = process.env.MARKETING_FEED_URL ?? 'https://claimondo.de/feed.json'

interface RawItem {
  id?: unknown; url?: unknown; title?: unknown; summary?: unknown
  date_published?: unknown; _claimondo?: { assetType?: unknown; keyFacts?: unknown }
}

export function parseJsonFeed(json: unknown): LinkedInFeedItem[] {
  const items = (json as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  return items.flatMap((raw: RawItem) => {
    if (typeof raw?.id !== 'string' || typeof raw?.url !== 'string') return []
    return [{
      guid: raw.id,
      url: raw.url,
      title: typeof raw.title === 'string' ? raw.title : '',
      excerpt: typeof raw.summary === 'string' ? raw.summary : '',
      keyFacts: Array.isArray(raw._claimondo?.keyFacts)
        ? (raw._claimondo!.keyFacts as unknown[]).filter((f): f is string => typeof f === 'string')
        : [],
      assetType: typeof raw._claimondo?.assetType === 'string' ? raw._claimondo!.assetType as string : 'Spoke',
      datePublished: typeof raw.date_published === 'string' ? raw.date_published : new Date(0).toISOString(),
    }]
  })
}

export async function fetchFeedItems(feedUrl: string = DEFAULT_FEED_URL): Promise<LinkedInFeedItem[]> {
  const res = await fetch(feedUrl, { headers: { accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`)
  return parseJsonFeed(await res.json())
}
