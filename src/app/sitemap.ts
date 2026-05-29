import type { MetadataRoute } from 'next'
import { SITE_URL, GUTACHTER_LANDING_URL, MAKLER_LANDING_URL } from '@/lib/seo/jsonld'
import { STAEDTE, isHubCity } from './kfz-gutachter/staedte'
import { getStadtLastUpdated } from './kfz-gutachter/freshness'
import {
  getCornerstones,
  getHaftpflichtSpokes,
  getDecoder,
  getSachverstaendige,
} from '@/lib/content/claimondo-mdx'

const HREFLANG_LOCALES = ['de-DE', 'en-US', 'ar', 'tr-TR', 'pl-PL', 'ru-RU'] as const

function langAlternates(path: string): Record<string, string> {
  const url = `${SITE_URL}${path}`
  const result: Record<string, string> = { 'x-default': url }
  for (const locale of HREFLANG_LOCALES) {
    result[locale] = url
  }
  return result
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
      alternates: { languages: langAlternates('/') },
    },
    {
      url: `${SITE_URL}/gutachter-finden`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.95,
      alternates: { languages: langAlternates('/gutachter-finden') },
    },
    {
      url: `${SITE_URL}/vorteile`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/wie-es-funktioniert`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
      alternates: { languages: langAlternates('/faq') },
    },
    {
      url: `${SITE_URL}/ueber-uns`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
      alternates: { languages: langAlternates('/ueber-uns') },
    },
    {
      url: `${SITE_URL}/schaden-melden`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    // KI-Ersteinschätzung — Conversion-Funnel-Einstieg vor /schaden-melden
    {
      url: `${SITE_URL}/ersteinschaetzung`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
      alternates: { languages: langAlternates('/ersteinschaetzung') },
    },
    // Beratung anfragen — Conversion-Service-Seite (live + mehrfach verlinkt; Doc 35 §6 Discovery-Fix)
    {
      url: `${SITE_URL}/beratung-anfragen`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    // Schadensreport — Datenpublikation, hoher GEO-Hebel
    {
      url: `${SITE_URL}/schadensreport-2026`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/schadensreport-2026') },
    },
    // Kfz-Gutachter Pillar + Themen-Pages + Stadt-Landingpages
    {
      url: `${SITE_URL}/kfz-gutachter`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.95,
      alternates: { languages: langAlternates('/kfz-gutachter') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/kosten`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/kosten') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/autoschaden-soforthilfe`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/autoschaden-soforthilfe') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/ablauf`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/ablauf') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/wertminderung`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/wertminderung') },
    },
    // AAR-938: Vermittler-Vergleich + Online-Gutachten-Wissens-Page (TSX-Spokes,
    // nicht MDX -> hardcoded; priority 0.9 wie die anderen Themen-Pages).
    {
      url: `${SITE_URL}/kfz-gutachter/vermittlungsportale-vergleich`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/vermittlungsportale-vergleich') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/online-kfz-gutachten`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/online-kfz-gutachten') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/sachverstaendiger-vs-gutachter`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/sachverstaendiger-vs-gutachter') },
    },
    // Stadt-Landingpages. Doc 38 §8: Hub-Cities (hyperlocale Tiefe) hoeher
    // gewichtet (0.9 statt 0.85), haeufiger gecrawlt (weekly statt monthly) und
    // mit Hreflang-Alternates (wie Doc 37 §7) — ihre Lokalfakten (Hotspots,
    // Baustellen, Unfallzahlen) aendern sich oefter. Die ~67 Nicht-Hub-Staedte
    // bleiben unveraendert bei 0.85/monthly ohne Alternates.
    ...STAEDTE.map((s) => {
      const isHub = isHubCity(s.slug)
      return {
        url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
        lastModified: getStadtLastUpdated(s.slug),
        changeFrequency: isHub ? ('weekly' as const) : ('monthly' as const),
        priority: isHub ? 0.9 : 0.85,
        ...(isHub ? { alternates: { languages: langAlternates(`/kfz-gutachter/${s.slug}`) } } : {}),
      }
    }),
    // Hinweis: /kfz-gutachter-<stadt> (Strategie 2, Ads-Hijack) ist bewusst
    // NICHT in der Sitemap und trägt robots=noindex. Trennung von der
    // SEO-Pillar /kfz-gutachter/<stadt> verhindert Cannibalization.
    // Recruiting-Subdomains — eigene kanonische URLs (claimondo.de/<pfad> 301t dorthin)
    {
      url: `${GUTACHTER_LANDING_URL}/`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${MAKLER_LANDING_URL}/`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Legal-Pages — fuer maschinenlesbare Vollstaendigkeit
    {
      url: `${SITE_URL}/impressum`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/datenschutz`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/agb`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/nutzungsbedingungen`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },

    // ─── Content-Library claimondo.de ─────────────────────────────────
    // Konversions-Pages (Stream B / B.2 — Doc 26: Kosten-Hub + Misstrauens-Pages)
    // Doc 37 §7: Hreflang-Alternates fuer die neuen Seiten ergaenzt (waren als
    // einzige indexierte Surface ohne Sprach-Alternates).
    {
      url: `${SITE_URL}/kosten-kfz-gutachten`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      alternates: { languages: langAlternates('/kosten-kfz-gutachten') },
    },
    {
      url: `${SITE_URL}/gegnerische-versicherung-zahlt-nicht`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      alternates: { languages: langAlternates('/gegnerische-versicherung-zahlt-nicht') },
    },
    {
      url: `${SITE_URL}/versicherung-schickt-gutachter`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.85,
      alternates: { languages: langAlternates('/versicherung-schickt-gutachter') },
    },
    {
      url: `${SITE_URL}/unverschuldeter-unfall-rechte`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      alternates: { languages: langAlternates('/unverschuldeter-unfall-rechte') },
    },
    // Konversions-Pages (Stream B.4 / Doc 26 — Fahrzeugtyp)
    {
      url: `${SITE_URL}/motorrad-gutachter`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      alternates: { languages: langAlternates('/motorrad-gutachter') },
    },
    {
      url: `${SITE_URL}/lkw-gutachter`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.85,
      alternates: { languages: langAlternates('/lkw-gutachter') },
    },
    {
      url: `${SITE_URL}/e-auto-gutachter`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      alternates: { languages: langAlternates('/e-auto-gutachter') },
    },
    // Tool-Page (Stream B.6 / Doc 26 — Unfallskizze)
    {
      url: `${SITE_URL}/unfallskizze`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.85,
      alternates: { languages: langAlternates('/unfallskizze') },
    },
    // Cornerstone-Pillar (Stream B.5 / Doc 26 — „Unfall was tun")
    {
      url: `${SITE_URL}/unfall-was-tun-als-geschaedigter`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.95,
      alternates: { languages: langAlternates('/unfall-was-tun-als-geschaedigter') },
    },
    // Cornerstones (Pillar-B Handbuch + Persona-Ratgeber)
    ...getCornerstones().map((a) => ({
      url: `${SITE_URL}${a.url}`,
      lastModified: a.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.95,
      alternates: { languages: langAlternates(a.url) },
    })),

    // Kfz-Haftpflichtschaden-Glossar-Hub (Doc 25 Gap 3) — crawlbare Index-URL fuer die 57 Spokes
    {
      url: `${SITE_URL}/haftpflicht`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      alternates: { languages: langAlternates('/haftpflicht') },
    },

    // Cluster H1–H7 Spokes (Haftungs-, Anspruchs-, Schadens-, Fristen-, Szenarien-, Komplex-Spokes)
    ...getHaftpflichtSpokes().map((a) => {
      // Prioritäten nach Cluster — H3 (Schadenspositionen) hat höchsten Commercial Intent
      const clusterPriority: Record<string, number> = {
        H3: 0.85,  // Schadenspositionen — höchstes Suchvolumen
        H6: 0.85,  // Standard-Unfall-Szenarien
        H4: 0.8,   // Fristen
        H1: 0.8,   // Haftungs-Grundlagen
        H2: 0.75,  // Anspruchs-Grundlagen
        H7: 0.7,   // Komplexe Konstellationen
      }
      return {
        url: `${SITE_URL}${a.url}`,
        lastModified: a.lastModified,
        changeFrequency: 'monthly' as const,
        priority: clusterPriority[a.cluster] ?? 0.75,
      }
    }),

    // Decoder (Versicherer-Brief-Antworten, höchste Conversion)
    // Versicherer-Brief-Decoder-Cluster: Hub (Stream A) + Spokes
    {
      url: `${SITE_URL}/decoder`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.85,
      alternates: { languages: langAlternates('/decoder') },
    },
    ...getDecoder().map((a) => ({
      url: `${SITE_URL}${a.url}`,
      lastModified: a.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),

    // Sachverständige-Cluster (SV-Verbände, Zertifizierungen, Prüfdienste) + Hub
    {
      url: `${SITE_URL}/sachverstaendige`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.85,
      alternates: { languages: langAlternates('/sachverstaendige') },
    },
    ...getSachverstaendige().map((a) => ({
      url: `${SITE_URL}${a.url}`,
      lastModified: a.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]
}
