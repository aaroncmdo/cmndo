import { SITE_URL } from '@/lib/seo/jsonld'
import { AUTHORS, DEFAULT_AUTHOR } from './authors'
import type { FeedItem } from './types'

function itemContent(item: FeedItem): string {
  if (item.keyFacts.length === 0) return item.excerpt
  return `${item.excerpt}\n\nKey Facts:\n${item.keyFacts.map((f) => `• ${f}`).join('\n')}`
}

export interface JsonFeedMeta {
  title: string
  description: string
  /** z. B. '/feed.json' — für `feed_url`. */
  feedPath: string
}

/** JSON Feed v1.1 (https://www.jsonfeed.org/version/1.1/). */
export function renderJsonFeed(meta: JsonFeedMeta, items: FeedItem[]) {
  const top = AUTHORS[DEFAULT_AUTHOR]
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: meta.title,
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}${meta.feedPath}`,
    description: meta.description,
    language: 'de-DE',
    icon: `${SITE_URL}/og-default.png`,
    favicon: `${SITE_URL}/favicon.svg`,
    authors: [{ name: top.name, url: top.url }],
    items: items.map((item) => {
      const author = AUTHORS[item.author as keyof typeof AUTHORS] ?? top
      return {
        id: item.guid,
        url: item.link,
        title: item.title,
        content_text: itemContent(item),
        summary: item.excerpt,
        date_published: item.pubDate.toISOString(),
        date_modified: item.pubDate.toISOString(),
        authors: [{ name: author.name, url: author.url }],
        tags: item.categories,
        language: 'de-DE',
        _claimondo: { assetType: item.assetType, keyFacts: item.keyFacts },
      }
    }),
  }
}
