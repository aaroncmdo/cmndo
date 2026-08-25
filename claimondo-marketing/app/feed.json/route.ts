import { renderJsonFeed } from '@/lib/feed/render-json'
import { getNewsFeedItems } from '@/lib/feed/news-items'
import { assertFeedFrontmatterValid } from '@/lib/feed/validate'

// News-Feed (JSON Feed v1.1): Pendant zu /feed.xml.
export const dynamic = 'force-static'
export const revalidate = 21600 // 6 h

export async function GET() {
  assertFeedFrontmatterValid()
  const feed = renderJsonFeed(
    {
      title: 'Claimondo – Aktuelle Wissens-Updates Kfz-Schadensregulierung',
      description:
        'Neueste Wissens-Assets von Claimondo zur Kfz-Haftpflicht-Schadensregulierung – Cornerstones, Glossar-Spokes, Versicherer-Brief-Decoder und Sachverständigen-Verbände.',
      feedPath: '/feed.json',
    },
    await getNewsFeedItems(),
  )
  return new Response(JSON.stringify(feed), {
    status: 200,
    headers: {
      'content-type': 'application/feed+json; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=21600',
    },
  })
}
