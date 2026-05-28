import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

// robots.txt — alles indexierbar, KI-Crawler explizit erlaubt (GEO), kein
// Crawl-delay. Sitemap + Host verlinkt.
export default function robots(): MetadataRoute.Robots {
  const aiCrawlers = [
    'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web',
    'anthropic-ai', 'PerplexityBot', 'Google-Extended', 'CCBot',
    'Applebot-Extended', 'Amazonbot', 'Bytespider',
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
