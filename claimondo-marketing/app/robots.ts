import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/jsonld'

/**
 * robots.txt — Max-Visibility-Setup für klassisches SEO + GEO (LLM-Crawler).
 *
 * Strategie:
 *  - Standard-Crawler: Allow `/`, gezielt Disallow für App-Portale + Auth + Build
 *  - Explizites Allow für AI-Antwort-/Search-Bots (GPTBot, ChatGPT-User, OAI-SearchBot,
 *    ClaudeBot, Claude-Web, PerplexityBot, Applebot, Meta-ExternalAgent, Amazonbot …)
 *  - Explizites Disallow für reine Training-/Scraper-Bots (CCBot, Bytespider,
 *    Google-Extended) — kein AI-Antwort-Nutzen, schützt Crawl-Budget (selektiver Block)
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

/** AI-Antwort-/Search-Bots, die wir explizit allowen (GEO-Visibility). */
const AI_BOTS_ALLOW = [
  // Google
  'Googlebot',
  'Googlebot-Image',
  'Googlebot-News',
  'Googlebot-Video',
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
  // Amazon
  'Amazonbot',
  // Mistral
  'MistralAI-User',
  // Diffbot
  'Diffbot',
  // Sonstige
  'DuckDuckBot',
  'YandexBot',
] as const

/**
 * Training-/Scraper-Bots, die wir blocken (selektiver Block):
 * kein Beitrag zu AI-Antworten/Search, nur Crawl-Last; CCBot/Bytespider sind
 * aggressive Scraper, Google-Extended ist reines Gemini-Training (Such-Index +
 * AI-Overviews via Googlebot bleiben unberührt).
 * Siehe docs/conversion-tracking-attribution-runbook.md (A3).
 */
const AI_BOTS_BLOCK = [
  'CCBot',           // Common Crawl (Trainings-Korpus vieler LLMs)
  'Bytespider',      // ByteDance/TikTok — aggressiver Scraper
  'Google-Extended', // Gemini-Training (Suche unberührt)
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
      // 3) Reine Training-/Scraper-Bots komplett blocken (selektiver Block).
      ...AI_BOTS_BLOCK.map((userAgent) => ({
        userAgent,
        disallow: '/',
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    // Kein `host:` — die `Host:`-Direktive ist non-standard (nur Yandex, dort
    // 2018 deprecated); Google/Bing kennen sie nicht. Bing Webmaster Tools
    // meldet `Host: …` als "syntax not understood". Kanonischer Host laeuft
    // ohnehin ueber 301-Redirects + rel=canonical, nicht ueber robots.txt.
  }
}
