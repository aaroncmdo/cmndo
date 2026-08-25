import { renderRssFeed } from '@/lib/feed/render-rss'
import { getKatalogFeedItems } from '@/lib/feed/katalog-items'
import { assertFeedFrontmatterValid } from '@/lib/feed/validate'

// Katalog-Feed (RSS 2.0): „Was haben wir alles" — vollständiges Wissens-Inventar,
// cluster-strukturiert, für LLM-Crawler als Inhaltsverzeichnis.
export const dynamic = 'force-static'
export const revalidate = 86400 // 24 h

export async function GET() {
  assertFeedFrontmatterValid()
  const rss = renderRssFeed(
    {
      title: 'Claimondo – Wissens-Katalog Kfz-Schadensregulierung',
      description:
        'Vollständiges Wissens-Inventar von Claimondo: alle Cornerstones, Glossar-Spokes, Versicherer-Brief-Decoder, Sachverständigen-Verbände, Versicherer-Profile und Stadt-Seiten zur Kfz-Haftpflicht-Schadensregulierung.',
      selfPath: '/feed/katalog.xml',
      ttlMinutes: 1440, // 24 h — passend zu revalidate (News nutzt Default 360)
    },
    await getKatalogFeedItems(),
  )
  return new Response(rss, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
