import type { MetadataRoute } from 'next'
import { SITE_URL, GUTACHTER_LANDING_URL, MAKLER_LANDING_URL, WERKSTATT_LANDING_URL, FLOTTE_LANDING_URL } from '@/lib/seo/jsonld'
import { STAEDTE, isHubCity } from '@/lib/kfz-gutachter/staedte'
import { stadtLastModified } from '@/lib/kfz-gutachter/freshness'
import { ladeLokalinhaltStaende } from '@/lib/kfz-gutachter/lokalinhalt'
import { getRouteLastUpdated } from '@/lib/seo/freshness'
import {
  getCornerstones,
  getHaftpflichtSpokes,
  getDecoder,
  getSachverstaendige,
  getVersicherer,
} from '@/lib/content/claimondo-mdx'
import { buildLanguageAlternates } from '@/lib/seo/alternates'
import { getPublishedArtikel } from '@/lib/wissen/db-articles'

// Echte Locale-URLs pro Pfad (de prefix-frei, en/tr/ar/ru/pl praefixiert) —
// zentral aus lib/seo/alternates, identisch zur hreflang-Logik der Pages
// (i18n-SEO). Vorher zeigten alle 6 Sprachen auf dieselbe URL (wertlos).
function langAlternates(path: string): Record<string, string> {
  return buildLanguageAlternates(path).languages
}

// Stuendlich neu erzeugen statt nur beim Build: der Ortsinhalt-Cron laeuft
// taeglich, Deploys nicht garantiert. Ohne das traegt die Sitemap die Staende
// vom letzten Deploy — an einem Wochenende ohne Release also veraltete
// lastmod-Werte fuer genau die Seiten, die frisch geworden sind.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Eine Query fuer alle Staedte: das echte Veroeffentlichungsdatum des
  // generierten Ortsinhalts. Ohne das meldeten 169 von 182 Stadtseiten den
  // hartkodierten Default aus freshness.ts (19.08.2026 gemessen) — auch die,
  // die am selben Tag frischen Inhalt bekommen hatten.
  const lokalStaende = await ladeLokalinhaltStaende()
  const now = new Date()
  const wissenArtikel = await getPublishedArtikel()

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: getRouteLastUpdated('/'),
      changeFrequency: 'weekly',
      priority: 1.0,
      alternates: { languages: langAlternates('/') },
    },
    {
      url: `${SITE_URL}/gutachter-finden`,
      lastModified: getRouteLastUpdated('/gutachter-finden'),
      changeFrequency: 'weekly',
      priority: 0.95,
      alternates: { languages: langAlternates('/gutachter-finden') },
    },
    {
      // Pendant zu /gutachter-finden, war bis 20.08. nicht angemeldet: die
      // Seite liefert 200, setzt `robots: index, follow` und ein Canonical auf
      // sich selbst — sie WILL indexiert werden, stand aber in keiner Sitemap.
      // Eine handgepflegte Liste vergisst neue Seiten still.
      url: `${SITE_URL}/werkstatt-finden`,
      lastModified: getRouteLastUpdated('/werkstatt-finden'),
      changeFrequency: 'weekly',
      priority: 0.9,
      alternates: { languages: langAlternates('/werkstatt-finden') },
    },
    {
      url: `${SITE_URL}/vorteile`,
      lastModified: getRouteLastUpdated('/vorteile'),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/wie-es-funktioniert`,
      lastModified: getRouteLastUpdated('/wie-es-funktioniert'),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: getRouteLastUpdated('/faq'),
      changeFrequency: 'monthly',
      priority: 0.8,
      alternates: { languages: langAlternates('/faq') },
    },
    {
      url: `${SITE_URL}/ueber-uns`,
      lastModified: getRouteLastUpdated('/ueber-uns'),
      changeFrequency: 'monthly',
      priority: 0.85,
      alternates: { languages: langAlternates('/ueber-uns') },
    },
    // /schaden-melden steht bewusst NICHT hier: der Zweig traegt
    // `robots: { index: false }` (schaden-melden/layout.tsx) — er ist der
    // Formular-Funnel, keine Landing. Eine noindex-Seite in der Sitemap
    // einzureichen kostet Crawl-Budget und erzeugt in der Search Console
    // "Durch noindex ausgeschlossen, in Sitemap eingereicht".
    // KI-Ersteinschätzung — SEO-Landing (Front-Door), klickt weiter in den /check-Funnel
    {
      url: `${SITE_URL}/ersteinschaetzung`,
      lastModified: getRouteLastUpdated('/ersteinschaetzung'),
      changeFrequency: 'monthly',
      priority: 0.85,
      alternates: { languages: langAlternates('/ersteinschaetzung') },
    },
    // /check — interaktiver Anspruchs-Funnel
    {
      url: `${SITE_URL}/check`,
      lastModified: getRouteLastUpdated('/check'),
      changeFrequency: 'monthly',
      priority: 0.85,
      alternates: { languages: langAlternates('/check') },
    },
    // Beratung anfragen — Conversion-Service-Seite (live + mehrfach verlinkt; Doc 35 §6 Discovery-Fix)
    {
      url: `${SITE_URL}/beratung-anfragen`,
      lastModified: getRouteLastUpdated('/beratung-anfragen'),
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    // Schadensreport — Datenpublikation, hoher GEO-Hebel
    {
      url: `${SITE_URL}/schadensreport-2026`,
      lastModified: getRouteLastUpdated('/schadensreport-2026'),
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/schadensreport-2026') },
    },
    // Kfz-Gutachter Pillar + Themen-Pages + Stadt-Landingpages
    {
      url: `${SITE_URL}/kfz-gutachter`,
      lastModified: getRouteLastUpdated('/kfz-gutachter'),
      changeFrequency: 'weekly',
      priority: 0.95,
      alternates: { languages: langAlternates('/kfz-gutachter') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/kosten`,
      lastModified: getRouteLastUpdated('/kfz-gutachter/kosten'),
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/kosten') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/autoschaden-soforthilfe`,
      lastModified: getRouteLastUpdated('/kfz-gutachter/autoschaden-soforthilfe'),
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/autoschaden-soforthilfe') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/ablauf`,
      lastModified: getRouteLastUpdated('/kfz-gutachter/ablauf'),
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/ablauf') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/wertminderung`,
      lastModified: getRouteLastUpdated('/kfz-gutachter/wertminderung'),
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/wertminderung') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/nutzungsausfall`,
      lastModified: getRouteLastUpdated('/kfz-gutachter/nutzungsausfall'),
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/nutzungsausfall') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/gutachten-service`,
      lastModified: getRouteLastUpdated('/kfz-gutachter/gutachten-service'),
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/gutachten-service') },
    },
    // AAR-938: Vermittler-Vergleich + Online-Gutachten-Wissens-Page (TSX-Spokes,
    // nicht MDX -> hardcoded; priority 0.9 wie die anderen Themen-Pages).
    {
      url: `${SITE_URL}/kfz-gutachter/vermittlungsportale-vergleich`,
      lastModified: getRouteLastUpdated('/kfz-gutachter/vermittlungsportale-vergleich'),
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/vermittlungsportale-vergleich') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/online-kfz-gutachten`,
      lastModified: getRouteLastUpdated('/kfz-gutachter/online-kfz-gutachten'),
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: { languages: langAlternates('/kfz-gutachter/online-kfz-gutachten') },
    },
    {
      url: `${SITE_URL}/kfz-gutachter/sachverstaendiger-vs-gutachter`,
      lastModified: getRouteLastUpdated('/kfz-gutachter/sachverstaendiger-vs-gutachter'),
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
        lastModified: stadtLastModified(s.slug, lokalStaende.get(s.slug)),
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
    {
      // Fehlte hier als einzige der vier Recruiting-Subdomains: lib/seo/jsonld.ts
      // definiert GUTACHTER_/MAKLER_/WERKSTATT_/FLOTTE_LANDING_URL, die Sitemap
      // listete nur drei. Die Konstante steht dort durch einen spaeter eingefuegten
      // Block (OG_DEFAULT_IMAGES) von ihren Geschwistern getrennt — beim Anlegen
      // dieser Eintraege uebersehen. werkstatt.claimondo.de ist live, von der
      // Startseite verlinkt und crawlbar, stand aber in keiner Sitemap.
      url: `${WERKSTATT_LANDING_URL}/`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${FLOTTE_LANDING_URL}/`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Legal-Pages — fuer maschinenlesbare Vollstaendigkeit
    {
      url: `${SITE_URL}/impressum`,
      lastModified: getRouteLastUpdated('/impressum'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/datenschutz`,
      lastModified: getRouteLastUpdated('/datenschutz'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/agb`,
      lastModified: getRouteLastUpdated('/agb'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/nutzungsbedingungen`,
      lastModified: getRouteLastUpdated('/nutzungsbedingungen'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },

    // ─── Content-Library claimondo.de ─────────────────────────────────
    // Konversions-Pages (Stream B / B.2 — Doc 26: Kosten-Hub + Misstrauens-Pages)
    // Doc 37 §7: Hreflang-Alternates fuer die neuen Seiten ergaenzt (waren als
    // einzige indexierte Surface ohne Sprach-Alternates).
    {
      url: `${SITE_URL}/kosten-kfz-gutachten`,
      lastModified: getRouteLastUpdated('/kosten-kfz-gutachten'),
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      alternates: { languages: langAlternates('/kosten-kfz-gutachten') },
    },
    {
      url: `${SITE_URL}/gegnerische-versicherung-zahlt-nicht`,
      lastModified: getRouteLastUpdated('/gegnerische-versicherung-zahlt-nicht'),
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      alternates: { languages: langAlternates('/gegnerische-versicherung-zahlt-nicht') },
    },
    {
      url: `${SITE_URL}/versicherung-schickt-gutachter`,
      lastModified: getRouteLastUpdated('/versicherung-schickt-gutachter'),
      changeFrequency: 'monthly' as const,
      priority: 0.85,
      alternates: { languages: langAlternates('/versicherung-schickt-gutachter') },
    },
    {
      url: `${SITE_URL}/unverschuldeter-unfall-rechte`,
      lastModified: getRouteLastUpdated('/unverschuldeter-unfall-rechte'),
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      alternates: { languages: langAlternates('/unverschuldeter-unfall-rechte') },
    },
    // Konversions-Pages (Stream B.4 / Doc 26 — Fahrzeugtyp)
    {
      url: `${SITE_URL}/motorrad-gutachter`,
      lastModified: getRouteLastUpdated('/motorrad-gutachter'),
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      alternates: { languages: langAlternates('/motorrad-gutachter') },
    },
    {
      url: `${SITE_URL}/lkw-gutachter`,
      lastModified: getRouteLastUpdated('/lkw-gutachter'),
      changeFrequency: 'monthly' as const,
      priority: 0.85,
      alternates: { languages: langAlternates('/lkw-gutachter') },
    },
    {
      url: `${SITE_URL}/e-auto-gutachter`,
      lastModified: getRouteLastUpdated('/e-auto-gutachter'),
      changeFrequency: 'monthly' as const,
      priority: 0.9,
      alternates: { languages: langAlternates('/e-auto-gutachter') },
    },
    // Tool-Page (Stream B.6 / Doc 26 — Unfallskizze)
    {
      url: `${SITE_URL}/unfallskizze`,
      lastModified: getRouteLastUpdated('/unfallskizze'),
      changeFrequency: 'monthly' as const,
      priority: 0.85,
      alternates: { languages: langAlternates('/unfallskizze') },
    },
    // Cornerstone-Pillar (Stream B.5 / Doc 26 — „Unfall was tun")
    {
      url: `${SITE_URL}/unfall-was-tun-als-geschaedigter`,
      lastModified: getRouteLastUpdated('/unfall-was-tun-als-geschaedigter'),
      changeFrequency: 'monthly' as const,
      priority: 0.95,
      alternates: { languages: langAlternates('/unfall-was-tun-als-geschaedigter') },
    },
    // Wissens-Hub — lesbare Uebersicht aller Wissens-Assets (menschliche Twin-Seite
    // der Feeds). de-only (Body deutsch -> canonical de), daher ohne Locale-Alternates.
    {
      url: `${SITE_URL}/wissen`,
      lastModified: getRouteLastUpdated('/wissen'),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    // Author-Hub (E-E-A-T / GEO) — Person-Schema-Seite des Default-Feed-Authors.
    {
      url: `${SITE_URL}/autor/aaron-sprafke`,
      lastModified: getRouteLastUpdated('/autor/aaron-sprafke'),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    },

    // Cornerstones (Pillar-B Handbuch + Persona-Ratgeber).
    // /ratgeber ist ausgenommen: die Seite canonicalisiert bewusst auf
    // /unfall-was-tun-als-geschaedigter (Stream B.5, siehe ratgeber/page.tsx).
    // Eine Seite einzureichen, die per Canonical auf eine andere zeigt, ist ein
    // Widerspruch — die Sitemap sagt "indexiere mich", das Canonical "ich bin
    // eine andere". Der Ziel-Cornerstone steht ohnehin selbst in der Sitemap.
    ...getCornerstones()
      .filter((a) => a.url !== '/ratgeber')
      .map((a) => ({
        url: `${SITE_URL}${a.url}`,
        lastModified: a.lastModified,
        changeFrequency: 'monthly' as const,
        priority: 0.95,
        alternates: { languages: langAlternates(a.url) },
      })),

    // Kfz-Haftpflichtschaden-Glossar-Hub (Doc 25 Gap 3) — crawlbare Index-URL fuer die 57 Spokes
    {
      url: `${SITE_URL}/haftpflicht`,
      lastModified: getRouteLastUpdated('/haftpflicht'),
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
      lastModified: getRouteLastUpdated('/decoder'),
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
      lastModified: getRouteLastUpdated('/sachverstaendige'),
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

    // Versicherer-Cluster (Brief-Antworten je Versicherer) + Hub. War bisher
    // komplett NICHT in der Sitemap (getVersicherer ungenutzt) — i18n-SEO ergaenzt.
    // de-only (Body deutsch -> canonical->de, vgl. versicherer/page.tsx + [slug]),
    // daher ohne Locale-Alternates, damit Google nur die de-Version indexiert.
    {
      url: `${SITE_URL}/versicherer`,
      lastModified: getRouteLastUpdated('/versicherer'),
      changeFrequency: 'monthly' as const,
      priority: 0.85,
    },
    ...getVersicherer().map((a) => ({
      url: `${SITE_URL}${a.url}`,
      lastModified: a.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    // KI-Wissensartikel (DB) — einzelne /wissen/<slug>-URLs mit per-Artikel-Freshness.
    ...wissenArtikel.map((a) => ({
      url: `${SITE_URL}/wissen/${a.slug}`,
      lastModified: a.last_modified
        ? new Date(a.last_modified)
        : a.veroeffentlicht_am
          ? new Date(a.veroeffentlicht_am)
          : now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}
