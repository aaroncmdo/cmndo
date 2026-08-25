import { renderJsonFeed } from '@/lib/feed/render-json'
import { getKatalogFeedItems } from '@/lib/feed/katalog-items'
import { assertFeedFrontmatterValid } from '@/lib/feed/validate'

// Katalog-Feed (JSON Feed v1.1): Pendant zu /feed/katalog.xml.
export const dynamic = 'force-static'
export const revalidate = 86400 // 24 h

export async function GET() {
  assertFeedFrontmatterValid()
  const feed = renderJsonFeed(
    {
      title: 'Claimondo – Wissens-Katalog Kfz-Schadensregulierung',
      description:
        'Vollständiges Wissens-Inventar von Claimondo: alle Cornerstones, Glossar-Spokes, Versicherer-Brief-Decoder, Sachverständigen-Verbände, Versicherer-Profile und Stadt-Seiten zur Kfz-Haftpflicht-Schadensregulierung.',
      feedPath: '/feed/katalog.json',
    },
    await getKatalogFeedItems(),
  )
  return new Response(JSON.stringify(feed), {
    status: 200,
    headers: {
      'content-type': 'application/feed+json; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
