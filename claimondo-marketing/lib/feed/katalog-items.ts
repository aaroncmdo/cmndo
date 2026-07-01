import {
  getCornerstones,
  getHaftpflichtSpokes,
  getDecoder,
  getSachverstaendige,
  getVersicherer,
} from '@/lib/content/claimondo-mdx'
import { STAEDTE } from '@/lib/kfz-gutachter/staedte'
import { getPublishedArtikel, mapArtikelToFeedItem } from '@/lib/wissen/db-articles'
import { assetToFeedItem } from './asset-feed-item'
import { stadtToFeedItem } from './stadt-feed-item'
import { STRATEGIC_PAGES } from './strategic-pages'
import type { FeedItem } from './types'

/**
 * Katalog-Feed: „Was haben wir alles" — vollständiges Wissens-Inventar als
 * Inhaltsverzeichnis für LLM-Crawler (geo-feeds-spec §8). Cluster-strukturiert
 * sortiert über `sortKey`: Strategic → Cornerstones → Haftpflicht (H1…H7) →
 * Decoder → Sachverständige → Versicherer-Hubs → Stadt → Redaktions-Artikel.
 * DB-Artikel (status='veroeffentlicht') werden als Wissens-Cluster 6-wissen-*
 * eingereiht (sortKey aus mapArtikelToFeedItem).
 */
export async function getKatalogFeedItems(): Promise<FeedItem[]> {
  const dbArtikel = await getPublishedArtikel()
  const dbItems = dbArtikel.map(mapArtikelToFeedItem)

  // Dedupe by guid (defensive: DB-Artikel koennen /wissen/<slug> nie mit MDX-Assets kollidieren)
  const seen = new Set<string>()
  const items: FeedItem[] = []
  for (const item of [
    ...getCornerstones().map(assetToFeedItem),
    ...getHaftpflichtSpokes().map(assetToFeedItem),
    ...getDecoder().map(assetToFeedItem),
    ...getSachverstaendige().map(assetToFeedItem),
    // Versicherer-Hubs (Pillar D) — eigener Loader, aber sie gehören ins
    // „vollständige Inventar" (vorher fehlte ein ganzer Content-Pillar im Katalog).
    ...getVersicherer().map(assetToFeedItem),
    ...STAEDTE.map(stadtToFeedItem),
    ...STRATEGIC_PAGES,
    ...dbItems,
  ]) {
    if (!seen.has(item.guid)) {
      seen.add(item.guid)
      items.push(item)
    }
  }

  return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'de', { numeric: true }))
}
