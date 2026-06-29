// src/lib/linkedin/types.ts
// Local row types bridge the new tables until database.types.ts is regenerated
// (deferred to avoid a hot-file merge conflict during parallel sessions).

export type FeedAssetType =
  | 'Cornerstone' | 'Spoke' | 'Decoder' | 'Sachverständige' | 'Stadt' | 'Strategic'

/** Normalised item parsed from the public JSON Feed (claimondo.de/feed.json). */
export interface LinkedInFeedItem {
  guid: string        // JSON Feed item.id (canonical URL)
  url: string         // item.url
  title: string       // item.title
  excerpt: string     // item.summary
  keyFacts: string[]  // item._claimondo.keyFacts
  assetType: FeedAssetType | string
  datePublished: string // item.date_published (ISO)
}

export type PostStatus = 'entwurf' | 'veroeffentlicht' | 'fehlgeschlagen' | 'uebersprungen'

export interface LinkedInPostRow {
  id: string
  feed_guid: string
  feed_url: string
  title: string
  excerpt: string | null
  composed_text: string
  status: PostStatus
  author_urn: string
  linkedin_post_urn: string | null
  scheduled_for: string | null
  published_at: string | null
  freigegeben_von: string | null
  freigegeben_am: string | null
  fehler: string | null
  erstellt_am: string
}

export interface LinkedInTokenRow {
  id: string
  organization_urn: string
  access_token: string
  refresh_token: string | null
  expires_at: string
  scope: string | null
  connected_by: string | null
}

export interface LinkedInPublishInput {
  authorUrn: string   // urn:li:organization:<id>
  text: string        // commentary
  link: string        // canonical URL
  title: string
  description: string // article card description
}

export type LinkedInPublishResult =
  | { ok: true; postUrn: string }
  | { ok: false; error: string }

export interface LinkedInPublisher {
  publish(input: LinkedInPublishInput): Promise<LinkedInPublishResult>
}
