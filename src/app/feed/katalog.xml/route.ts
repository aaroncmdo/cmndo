import { renderRssFeed } from '@/lib/feed/render-rss'
import { getKatalogFeedItems } from '@/lib/feed/katalog-items'

// Katalog-Feed (RSS 2.0): „Was haben wir alles" — vollständiges Wissens-Inventar,
// cluster-strukturiert, für LLM-Crawler als Inhaltsverzeichnis.
export const dynamic = 'force-static'
export const revalidate = 86400 // 24 h

export function GET() {
  const rss = renderRssFeed(
    {
      title: 'Claimondo — Wissens-Katalog Kfz-Schadensregulierung',
      description:
        'Vollständiges Wissens-Inventar von Claimondo: alle Cornerstones, Glossar-Spokes, Versicherer-Brief-Decoder, Sachverständigen-Verbände und Stadt-Seiten zur Kfz-Haftpflicht-Schadensregulierung.',
      selfPath: '/feed/katalog.xml',
    },
    getKatalogFeedItems(),
  )
  return new Response(rss, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
