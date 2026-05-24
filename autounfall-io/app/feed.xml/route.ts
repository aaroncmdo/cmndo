import { SITE } from '@/lib/site'
import { getAllArticles } from '@/lib/articles'

// RSS-Feed (WP-1b) — Crawl-/Discovery-Beschleunigung. Neueste Artikel als
// application/rss+xml unter /feed.xml. STANDALONE: channel = Kitta & Sprafke UG,
// kein Claimondo. Statisch (force-static) — wird beim Build erzeugt + per
// Deploy ausgeliefert; revalidiert mit dem naechsten Build.
export const dynamic = 'force-static'

const MAX_ITEMS = 30

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET() {
  const articles = [...getAllArticles()]
    .sort((a, b) => b.datePublished.localeCompare(a.datePublished))
    .slice(0, MAX_ITEMS)

  const lastBuild = new Date().toUTCString()
  const items = articles
    .map((a) => {
      const url = `${SITE.url}/${a.slug}`
      const pub = new Date(`${a.datePublished}T08:00:00Z`).toUTCString()
      return [
        '    <item>',
        `      <title>${esc(a.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${pub}</pubDate>`,
        `      <description>${esc(a.description)}</description>`,
        '    </item>',
      ].join('\n')
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE.name)} — Unfall-Ratgeber</title>
    <link>${SITE.url}</link>
    <atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${esc(SITE.description)}</description>
    <language>de-DE</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>
`
  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  })
}
