import { SITE_URL } from '@/lib/seo/jsonld'
import { AUTHORS, DEFAULT_AUTHOR } from './authors'
import type { FeedItem } from './types'

/** XML-Entity-Escaping für Element-Text und Attribut-Werte. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** CDATA-Wrapper mit Guard gegen vorzeitiges `]]>`-Terminieren. */
function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
}

function itemBody(item: FeedItem): string {
  if (item.keyFacts.length === 0) return item.excerpt
  return `${item.excerpt}\n\nKey Facts:\n${item.keyFacts.map((f) => `• ${f}`).join('\n')}`
}

export interface RssChannelMeta {
  title: string
  description: string
  /** z. B. '/feed.xml' — für den <atom:link rel="self">. */
  selfPath: string
}

export function renderRssFeed(meta: RssChannelMeta, items: FeedItem[]): string {
  const lastBuild = new Date().toUTCString()

  const itemsXml = items
    .map((item) => {
      const author = AUTHORS[item.author as keyof typeof AUTHORS] ?? AUTHORS[DEFAULT_AUTHOR]
      const categories = item.categories
        .map((c) => `      <category>${escapeXml(c)}</category>`)
        .join('\n')
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.guid)}</guid>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      <dc:creator>${escapeXml(author.name)}</dc:creator>
${categories}
      <description>${cdata(itemBody(item))}</description>
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${SITE_URL}</link>
    <atom:link href="${SITE_URL}${meta.selfPath}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(meta.description)}</description>
    <language>de-DE</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <ttl>360</ttl>
    <image>
      <url>${SITE_URL}/og-default.png</url>
      <title>${escapeXml(meta.title)}</title>
      <link>${SITE_URL}</link>
    </image>
${itemsXml}
  </channel>
</rss>`
}
