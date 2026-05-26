import { describe, it, expect } from 'vitest'
import { escapeXml, renderRssFeed } from '@/lib/feed/render-rss'
import { renderJsonFeed } from '@/lib/feed/render-json'
import { getNewsFeedItems } from '@/lib/feed/news-items'
import { getKatalogFeedItems } from '@/lib/feed/katalog-items'
import { getAllAssets } from '@/lib/content/claimondo-mdx'
import { validateAsset } from '@/lib/content/validate-frontmatter'

describe('escapeXml', () => {
  it('escaped die fuenf XML-Entities', () => {
    expect(escapeXml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;')
  })
})

describe('news feed', () => {
  const items = getNewsFeedItems()
  it('cappt bei 30 Items', () => {
    expect(items.length).toBeLessThanOrEqual(30)
    expect(items.length).toBeGreaterThan(0)
  })
  it('ist absteigend nach pubDate sortiert', () => {
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].pubDate.getTime()).toBeGreaterThanOrEqual(items[i].pubDate.getTime())
    }
  })
  it('enthaelt keine Stadt-Items (die gehoeren in den Katalog)', () => {
    expect(items.every((i) => i.assetType !== 'Stadt')).toBe(true)
  })
})

describe('katalog feed', () => {
  const items = getKatalogFeedItems()
  it('enthaelt mehr Items als der News-Feed (Voll-Inventar inkl. Staedte)', () => {
    expect(items.length).toBeGreaterThan(getNewsFeedItems().length)
  })
  it('ordnet Strategic-Pages vor die Staedte', () => {
    const firstStrategic = items.findIndex((i) => i.assetType === 'Strategic')
    const firstStadt = items.findIndex((i) => i.assetType === 'Stadt')
    expect(firstStrategic).toBeGreaterThanOrEqual(0)
    expect(firstStadt).toBeGreaterThan(firstStrategic)
  })
  it('gibt jedem Item eine guid == link (isPermaLink, absolute claimondo.de-URL)', () => {
    expect(
      items.every((i) => i.guid === i.link && i.link.startsWith('https://claimondo.de')),
    ).toBe(true)
  })
})

// Qualitaets-Gate (geo-feeds-spec §1): jedes MDX-Asset traegt valides excerpt + keyFacts.
describe('feed frontmatter completeness', () => {
  it('alle Content-Assets haben valides excerpt + keyFacts', () => {
    const errors = getAllAssets().flatMap(validateAsset)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

describe('rss rendering', () => {
  const xml = renderRssFeed(
    { title: 'T', description: 'D', selfPath: '/feed.xml' },
    getNewsFeedItems(),
  )
  it('ist ein wohlgeformtes RSS-Geruest', () => {
    expect(xml.startsWith('<?xml')).toBe(true)
    expect(xml).toContain('<rss')
    expect(xml).toContain('<atom:link href="https://claimondo.de/feed.xml"')
  })
  it('rendert genau ein <item> pro News-Item', () => {
    const count = (xml.match(/<item>/g) ?? []).length
    expect(count).toBe(getNewsFeedItems().length)
  })
  it('hat kein nacktes & ausserhalb von CDATA', () => {
    const withoutCdata = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    const badAmp = withoutCdata.match(/&(?!(amp|lt|gt|quot|apos);)/g)
    expect(badAmp).toBeNull()
  })
})

describe('json feed rendering', () => {
  const feed = renderJsonFeed(
    { title: 'T', description: 'D', feedPath: '/feed.json' },
    getNewsFeedItems(),
  )
  it('hat version, feed_url und items', () => {
    expect(feed.version).toContain('jsonfeed.org')
    expect(feed.feed_url).toBe('https://claimondo.de/feed.json')
    expect(feed.items.length).toBe(getNewsFeedItems().length)
  })
  it('jedes Item hat id, url, title, content_text', () => {
    expect(feed.items.every((i) => i.id && i.url && i.title && i.content_text)).toBe(true)
  })
})
