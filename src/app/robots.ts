import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/jsonld'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Alle Standard-Crawler: Marketing-Seiten offen, App-Portale gesperrt
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
      // KI-Suchmaschinen explizit erlauben (GEO-Optimierung)
      { userAgent: 'Googlebot', allow: '/' },
      { userAgent: 'Googlebot-Image', allow: '/' },
      // Google-Extended ist Geminis Training-Crawler — explizit allowen
      // damit Claimondo-Content in Gemini-Antworten zitiert wird (GEO).
      { userAgent: 'Google-Extended', allow: '/' },
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
