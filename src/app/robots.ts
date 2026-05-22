import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/jsonld'

/**
 * robots.txt — Max-Visibility-Setup für klassisches SEO + GEO (LLM-Crawler).
 *
 * Strategie:
 *  - Standard-Crawler: Allow `/`, gezielt Disallow für App-Portale + Auth + Build
 *  - Explizites Allow für alle relevanten AI-Bots (GPTBot, ClaudeBot, PerplexityBot,
 *    Google-Extended, Meta-ExternalAgent, Bytespider, Amazonbot, Diffbot, Mistral …)
 *
 * Quelle: marketing-strategy/strategy/16-TECH-IMPLEMENTATION-ROBOTS-INFOPLACEMENT.md
 *  + marketing-strategy/published/claimondo.de/* (69 Public-Assets)
 */

const DISALLOW_PORTALS_AND_AUTH = [
  '/admin/',
  '/dispatch/',
  '/gutachter/',
  '/gutachter-partner/',     // komplett, nicht nur /dashboard/
  '/kunde/',
  '/kunde-termin/',
  '/kanzlei/',
  '/makler/',
  '/mitarbeiter/',
  '/sa-volltext/',
  '/flow/',
  '/upload/',
  '/dev/',
  '/api/',
  '/login',
  '/passwort-vergessen',
  '/passwort-aendern',
  '/passwort-zuruecksetzen',
  '/_next/',
  // Ads-Hijack-LP bewusst nicht indexiert (Cannibalization-Schutz)
  '/kfzgutachter-lp',
]

/** Alle AI-Bots, die wir explizit allowen (max GEO-Visibility). */
const AI_BOTS_ALLOW = [
  // Google
  'Googlebot',
  'Googlebot-Image',
  'Googlebot-News',
  'Googlebot-Video',
  'Google-Extended',          // Gemini Training
  // Bing
  'Bingbot',
  'BingPreview',
  // OpenAI
  'GPTBot',                   // ChatGPT Training
  'ChatGPT-User',             // Live-Browsing ChatGPT Plus
  'OAI-SearchBot',            // ChatGPT Search (SearchGPT)
  // Anthropic
  'ClaudeBot',
  'anthropic-ai',
  'Claude-Web',
  'Claude-SearchBot',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Apple
  'Applebot',
  'Applebot-Extended',
  // Meta
  'Meta-ExternalAgent',
  'FacebookBot',
  // ByteDance
  'Bytespider',
  // Amazon
  'Amazonbot',
  // Mistral
  'MistralAI-User',
  // Diffbot
  'Diffbot',
  // Common Crawl
  'CCBot',
  // Sonstige
  'DuckDuckBot',
  'YandexBot',
] as const

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // 1) Catch-All: alles offen ausser App-Portale/Auth/Build
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW_PORTALS_AND_AUTH,
      },
      // 2) Pro AI-Bot expliziter Allow-Eintrag mit gleichen Disallows
      //    (manche LLMs werten das stärker als das generische `*`).
      ...AI_BOTS_ALLOW.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: DISALLOW_PORTALS_AND_AUTH,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
