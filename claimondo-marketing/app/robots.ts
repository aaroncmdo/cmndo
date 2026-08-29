import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/jsonld'
import { AI_BOTS_BLOCK } from '@/lib/seo/ai-bots'

/**
 * robots.txt — Max-Visibility-Setup für klassisches SEO + GEO (LLM-Crawler).
 *
 * Strategie:
 *  - Standard-Crawler: Allow `/`, gezielt Disallow für App-Portale + Auth + Build
 *  - Explizites Allow für AI-Antwort-/Search-Bots (GPTBot, ChatGPT-User, OAI-SearchBot,
 *    ClaudeBot, Claude-Web, PerplexityBot, Applebot, Meta-ExternalAgent, Amazonbot …)
 *  - Explizites Disallow nur noch für aggressive Scraper ohne Zitier-Nutzen (Bytespider)
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
  // Google-Extended = Freigabe fuer Gemini-/Vertex-Grounding (12.08.2026, Aaron).
  // Es ist KEIN eigener Crawler, sondern ein Nutzungs-Signal fuer bereits von
  // Googlebot geholte Inhalte; die AI-Overviews der SUCHE liefen ohnehin ueber
  // Googlebot und waren nie betroffen. Vorher geblockt -> wir fehlten in Gemini.
  'Google-Extended',
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
  // Common Crawl — freigegeben 12.08.2026 (Aaron). Der CC-Korpus ist Input
  // vieler Modelle; ein Block schliesst uns dort dauerhaft aus. Preis der
  // Freigabe: der Korpus ist oeffentlich, also auch fuer Wettbewerber lesbar —
  // die Inhalte sind aber ohnehin oeffentliche Marketing-Seiten.
  'CCBot',
  // Sonstige
  'DuckDuckBot',
  'YandexBot',
] as const

/**
 * Verbleibender selektiver Block.
 *
 * Bis 12.08.2026 standen hier auch CCBot + Google-Extended — unter der Annahme,
 * sie brächten „keinen AI-Antwort-Nutzen". Diese Annahme kollidierte mit dem
 * erklärten Ziel, in KI-Antworten zitiert zu werden: Google-Extended steuert das
 * Gemini-/Vertex-Grounding, CCBot speist den Common-Crawl-Korpus. Beide sind
 * jetzt in AI_BOTS_ALLOW (Aaron-Entscheid).
 *
 * Bytespider bleibt geblockt: aggressiver Scraper (ByteDance/TikTok) ohne
 * Zitier-Oberfläche im deutschen Kfz-Gutachten-Markt — reine Crawl-Last.
 * Siehe docs/conversion-tracking-attribution-runbook.md (A3) und
 * docs/superpowers/specs/2026-08-12-hyperlokal-geo-content-design.md §8.
 */
// Die Liste lebt in `lib/seo/ai-bots.ts` — dieselbe Quelle nutzt die Middleware,
// die den Disallow durchsetzt (Bytespider ignoriert ihn, 29.08.2026 gemessen).

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
