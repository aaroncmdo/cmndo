/**
 * Gemeinsamer Item-Typ für alle Feed-Routen (RSS + JSON, News + Katalog).
 * Wird aus drei Quellen befüllt:
 *  - ClaimondoAsset (cornerstones/haftpflicht/decoder/sachverstaendige) → asset-feed-item.ts
 *  - Stadt (kfz-gutachter/[stadt])                                      → stadt-feed-item.ts
 *  - Strategic-Pages (hardcoded)                                        → strategic-pages.ts
 *
 * Siehe marketing-strategy/research/mcp/geo-feeds-spec-2026-05-24.md.
 */

export type FeedAssetType =
  | 'Cornerstone'
  | 'Spoke'
  | 'Decoder'
  | 'Sachverständige'
  | 'Stadt'
  | 'Strategic'

export interface FeedItem {
  title: string
  /** Absolute Canonical-URL. */
  link: string
  /** GUID = Canonical-URL (isPermaLink="true"). */
  guid: string
  pubDate: Date
  assetType: FeedAssetType
  /** Bereits aufgelöste, menschenlesbare Kategorie-Labels (Cluster-Label + Asset-Typ). */
  categories: string[]
  /** Key in AUTHORS (src/lib/feed/authors.ts). */
  author: string
  /** Zusammenfassung, Plain-Text (~250–500 Zeichen). */
  excerpt: string
  /** 3–5 Bullets mit Kern-Fakten (BGH-Az., §§, Spannen, Fristen). */
  keyFacts: string[]
  /** Sortier-Schlüssel für den cluster-strukturierten Katalog-Feed. */
  sortKey: string
}
