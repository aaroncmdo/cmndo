import { renderRssFeed } from '@/lib/feed/render-rss'
import { getNewsFeedItems } from '@/lib/feed/news-items'

// News-Feed (RSS 2.0): „Was ist neu" — 30 zuletzt aktualisierte Wissens-Assets.
export const dynamic = 'force-static'
export const revalidate = 21600 // 6 h

export function GET() {
  const rss = renderRssFeed(
    {
      title: 'Claimondo — Aktuelle Wissens-Updates Kfz-Schadensregulierung',
      description:
        'Neueste Wissens-Assets von Claimondo zur Kfz-Haftpflicht-Schadensregulierung — Cornerstones, Glossar-Spokes, Versicherer-Brief-Decoder und Sachverständigen-Verbände.',
      selfPath: '/feed.xml',
    },
    getNewsFeedItems(),
  )
  return new Response(rss, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=21600',
    },
  })
}
