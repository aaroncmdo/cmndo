import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/jsonld'

// AI-Bots explizit erlauben — kritisch für Citation in
// ChatGPT, Perplexity, Claude, Copilot, Gemini.
// Princeton GEO Research: Erlaubte Bots = Voraussetzung für AI-Citation.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/dispatch/',
          '/gutachter/',
          '/gutachter-partner/dashboard/',
          '/kunde/',
          '/api/',
          '/login',
          '/passwort-vergessen',
          '/_next/',
        ],
      },
      // AI-Search-Bots — Voraussetzung für AI-Visibility
      { userAgent: 'Googlebot', allow: '/' },
      { userAgent: 'Googlebot-Image', allow: '/' },
      { userAgent: 'Bingbot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'OAI-SearchBot', allow: '/' },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'anthropic-ai', allow: '/' },
      { userAgent: 'Claude-Web', allow: '/' },
      { userAgent: 'Applebot', allow: '/' },
      { userAgent: 'Applebot-Extended', allow: '/' },
      { userAgent: 'CCBot', allow: '/' },
      { userAgent: 'DuckDuckBot', allow: '/' },
      { userAgent: 'YandexBot', allow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
