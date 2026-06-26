import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

// robots.txt — indexierbar, AI-Antwort-/Search-Bots erlaubt (GEO); reine
// Training-/Scraper-Bots (CCBot/Bytespider/Google-Extended) geblockt.
export default function robots(): MetadataRoute.Robots {
  const aiCrawlers = [
    'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web',
    'anthropic-ai', 'PerplexityBot', 'Applebot-Extended', 'Amazonbot',
  ]
  // Reine Training-/Scraper-Bots blocken (kein AI-Antwort-Nutzen; Such-Index
  // via Googlebot + AI-Antworten via GPTBot/ClaudeBot/Perplexity bleiben).
  const blockedCrawlers = ['CCBot', 'Bytespider', 'Google-Extended']
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
