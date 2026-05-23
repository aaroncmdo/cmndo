import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

// robots.txt (Next generiert /robots.txt). GEO-Strategie: KI-Crawler explizit
// erlauben, keine Scraper-Sperren, keine Crawl-delay. noindex-Seiten (PSEO,
// Leadmagnete, Selbstanzeige) werden NICHT per Disallow geblockt — sonst sieht
// der Crawler das robots-meta-noindex nicht; die Indexierungs-Steuerung laeuft
// pro Seite ueber `robots: { index: false }` (WP-5).
export default function robots(): MetadataRoute.Robots {
  const aiCrawlers = [
    'GPTBot',
    'ChatGPT-User',
    'OAI-SearchBot',
    'ClaudeBot',
    'Claude-Web',
    'anthropic-ai',
    'PerplexityBot',
    'Google-Extended',
    'CCBot',
    'Applebot-Extended',
    'Amazonbot',
    'Bytespider',
  ]
  return {
    rules: [
      { userAgent: aiCrawlers, allow: '/' },
      { userAgent: '*', allow: '/' },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  }
}
