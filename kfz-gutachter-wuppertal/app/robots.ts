import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

// robots.txt — indexierbar, AI-Antwort-/Search-Bots erlaubt (GEO).
// CCBot + Google-Extended sind seit 12.08.2026 bewusst FREI (Aaron-Entscheid):
// beide zahlen aufs Citation-Ziel ein — CCBot speist den Common-Crawl-Korpus
// vieler Modelle, Google-Extended gibt das Gemini-/Vertex-Grounding frei (die
// AI-Overviews der Suche liefen ohnehin ueber Googlebot, nie ueber diesen Token).
// Siehe docs/superpowers/specs/2026-08-12-hyperlokal-geo-content-design.md §8.
export default function robots(): MetadataRoute.Robots {
  const aiCrawlers = [
    'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web',
    'anthropic-ai', 'PerplexityBot', 'Applebot-Extended', 'Amazonbot',
    'CCBot', 'Google-Extended',
  ]
  // Bleibt geblockt: aggressiver Scraper (ByteDance/TikTok) ohne Zitier-
  // Oberflaeche im deutschen Kfz-Gutachten-Markt — reine Crawl-Last.
  const blockedCrawlers = ['Bytespider']
  return {
    rules: [
      { userAgent: aiCrawlers, allow: '/' },
      { userAgent: blockedCrawlers, disallow: '/' },
      { userAgent: '*', allow: '/' },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  }
}
