import { clusterLabel, type ClaimondoAsset } from '@/lib/content/claimondo-mdx'
import { SITE_URL } from '@/lib/seo/jsonld'
import { DEFAULT_AUTHOR } from './authors'
import type { FeedItem, FeedAssetType } from './types'

/** Folder → Reihenfolge im Katalog-Feed (Cornerstones zuerst, Stadt zuletzt via stadt-feed-item). */
const FOLDER_RANK: Record<ClaimondoAsset['folder'], number> = {
  cornerstones: 0,
  haftpflicht: 1,
  decoder: 2,
  sachverstaendige: 3,
  // Versicherer-Hubs (Pillar D) haben einen eigenen Loader (getVersicherer) und
  // fliessen aktuell NICHT in getAllAssets/den Katalog-Feed; der Rank haelt nur
  // das exhaustive Record type-vollstaendig (Sprint 1).
  versicherer: 4,
}

function assetTypeOf(a: ClaimondoAsset): FeedAssetType {
  switch (a.folder) {
    case 'cornerstones':
      return 'Cornerstone'
    case 'decoder':
      return 'Decoder'
    case 'sachverstaendige':
      return 'Sachverständige'
    default:
      return 'Spoke'
  }
}

/**
 * ClaimondoAsset → FeedItem. excerpt/keyFacts kommen aus dem MDX-Frontmatter
 * (handgepflegt, geo-feeds-spec §1+§14). Fällt defensiv auf das vorhandene
 * Featured-Snippet zurück, falls ein Asset die Felder (noch) nicht hat — so
 * bricht kein Feed-Build, auch wenn der Retrofit eines Files fehlt.
 */
export function assetToFeedItem(a: ClaimondoAsset): FeedItem {
  const link = a.url.startsWith('http') ? a.url : `${SITE_URL}${a.url}`
  const type = assetTypeOf(a)
  const categories = [clusterLabel(a.cluster), type].filter(Boolean)
  return {
    title: a.title,
    link,
    guid: link,
    pubDate: a.lastModified,
    assetType: type,
    categories,
    author: DEFAULT_AUTHOR,
    excerpt: a.excerpt || a.snippet || '',
    keyFacts: a.keyFacts.length > 0 ? a.keyFacts : [],
    sortKey: `${FOLDER_RANK[a.folder]}-${a.cluster}-${a.nummer ?? ''}-${a.title}`,
  }
}
