import {
  getCornerstones,
  getHaftpflichtSpokes,
  getDecoder,
  getSachverstaendige,
} from '@/lib/content/claimondo-mdx'
import { getPublishedArtikel, mapArtikelToFeedItem, mergeAndSortItems } from '@/lib/wissen/db-articles'
import { assetToFeedItem } from './asset-feed-item'
import { STRATEGIC_PAGES } from './strategic-pages'
import type { FeedItem } from './types'

const NEWS_CAP = 30

function byDateDesc(a: FeedItem, b: FeedItem): number {
  return b.pubDate.getTime() - a.pubDate.getTime()
}

function take(items: FeedItem[], n: number): FeedItem[] {
  return [...items].sort(byDateDesc).slice(0, n)
}

/**
 * News-Feed: „Was ist neu" — die zuletzt aktualisierten Wissens-Assets, sortiert nach
 * pubDate, mit Per-Typ-Cap (geo-feeds-spec §6). Stadt-Pages bleiben außen vor (kein
 * Freshness-Signal ohne lastUpdated → gehören in den Katalog-Feed).
 * DB-Artikel (status='veroeffentlicht') werden als frische Items eingespeist
 * und loesen das H1-Freshness-Problem.
 */
export async function getNewsFeedItems(): Promise<FeedItem[]> {
  const cornerstones = getCornerstones().map(assetToFeedItem)
  const spokes = getHaftpflichtSpokes().map(assetToFeedItem)
  const decoder = getDecoder().map(assetToFeedItem)
  const sachverstaendige = getSachverstaendige().map(assetToFeedItem)

  const mdxItems = [
    ...take(cornerstones, 5),
    ...take(spokes, 12),
    ...take(decoder, 5),
    ...take(sachverstaendige, 4),
    ...take(STRATEGIC_PAGES, 4),
  ]

  const dbArtikel = await getPublishedArtikel()
  const dbItems = dbArtikel.map(mapArtikelToFeedItem)

  return mergeAndSortItems(mdxItems, dbItems).slice(0, NEWS_CAP)
}
