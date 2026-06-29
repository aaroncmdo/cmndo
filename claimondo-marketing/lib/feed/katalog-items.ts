import {
  getCornerstones,
  getHaftpflichtSpokes,
  getDecoder,
  getSachverstaendige,
  getVersicherer,
} from '@/lib/content/claimondo-mdx'
import { STAEDTE } from '@/lib/kfz-gutachter/staedte'
import { assetToFeedItem } from './asset-feed-item'
import { stadtToFeedItem } from './stadt-feed-item'
import { STRATEGIC_PAGES } from './strategic-pages'
import type { FeedItem } from './types'

/**
 * Katalog-Feed: „Was haben wir alles" — vollständiges Wissens-Inventar als
 * Inhaltsverzeichnis für LLM-Crawler (geo-feeds-spec §8). Cluster-strukturiert
 * sortiert über `sortKey`: Strategic → Cornerstones → Haftpflicht (H1…H7) →
 * Decoder → Sachverständige → Versicherer-Hubs → Stadt.
 */
export function getKatalogFeedItems(): FeedItem[] {
  const items: FeedItem[] = [
    ...getCornerstones().map(assetToFeedItem),
    ...getHaftpflichtSpokes().map(assetToFeedItem),
    ...getDecoder().map(assetToFeedItem),
    ...getSachverstaendige().map(assetToFeedItem),
    // Versicherer-Hubs (Pillar D) — eigener Loader, aber sie gehören ins
    // „vollständige Inventar" (vorher fehlte ein ganzer Content-Pillar im Katalog).
    ...getVersicherer().map(assetToFeedItem),
    ...STAEDTE.map(stadtToFeedItem),
    ...STRATEGIC_PAGES,
  ]

  return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'de', { numeric: true }))
}
