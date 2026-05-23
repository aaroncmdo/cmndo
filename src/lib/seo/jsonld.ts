// JSON-LD Schema-Helper für SEO + GEO-Optimierung
// Princeton GEO Research: FAQPage = +40% AI-Visibility, Citations = +40%
// Schema.org Templates für deutsche KFZ-Schadensregulierung

// HQ-Adresse aus dem Brand-SOT (Doc 30 §3) — kein Hardcode mehr hier.
// brand-constants importiert nichts → kein Zirkel (jsonld → brand-constants ist einseitig).
import { HQ_STREET, HQ_POSTAL_CODE, HQ_CITY, FOUNDER_NICOLAS_NAME, FOUNDER_AARON_NAME } from './brand-constants'

export const SITE_URL = 'https://claimondo.de'
// Marketing-Subdomains für B2B-Recruiting — kanonische Roots der jeweiligen Landingpages.
export const GUTACHTER_LANDING_URL = 'https://gutachter.claimondo.de'
export const MAKLER_LANDING_URL = 'https://makler.claimondo.de'
export const SITE_NAME = 'Claimondo'
export const PHONE_E164 = '+4922125906530'
export const PHONE_DISPLAY = '0221 25906530'
export const CONTACT_EMAIL = 'kontakt@claimondo.de'
/** Einzige Code-Quelle des WhatsApp-Deep-Links (Sweep 2026-05-23). */
export const WHATSAPP_HREF = 'https://wa.me/4922125906530'

// Hauptstadt + Region für GEO-Targeting
const HQ_LOCATION = {
  streetAddress: HQ_STREET,
  postalCode: HQ_POSTAL_CODE,
  addressLocality: HQ_CITY,
  addressRegion: 'NW',
  addressCountry: 'DE',
}

// Founder-Profile für E-E-A-T (Person-Schema)
// TODO Aaron: echte Bio-Texte + LinkedIn-URLs einsetzen — Texte sind Erstentwurf
const FOUNDERS = [
  {
    name: FOUNDER_NICOLAS_NAME,
    jobTitle: 'CEO & Mitgründer',
    sameAs: 'https://www.linkedin.com/in/nicolas-kitta-451947246/',
    image: `${SITE_URL}/brand/team-office.jpg`,
  },
  {
    name: FOUNDER_AARON_NAME,
    jobTitle: 'COO & Mitgründer',
    sameAs: 'https://www.linkedin.com/in/aaron-sprafke-355085237/',
    image: `${SITE_URL}/brand/team-headset.png`,
  },
]

// Bedeutende Städte die wir bedienen (areaServed)
const SERVED_CITIES = [
  'Köln', 'Düsseldorf', 'Bonn', 'Aachen', 'Dortmund', 'Essen', 'Duisburg',
  'Wuppertal', 'Mönchengladbach', 'Krefeld', 'Leverkusen',
  'Frankfurt am Main', 'Hamburg', 'München', 'Berlin', 'Stuttgart',
]

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    legalName: 'Claimondo GmbH',
    alternateName: ['claimondo', 'Claimondo Schadensregulierung'],
    url: SITE_URL,
    logo: `${SITE_URL}/claimondo-icon.svg`,
    image: `${SITE_URL}/claimondo-icon.svg`,
    slogan: 'Vollständige Schadensregulierung — auf Augenhöhe.',
    description:
      'Claimondo ist eine 2025 in Köln gegründete digitale Plattform für die vollständige Regulierung von Kfz-Haftpflichtschäden. Über zertifizierte Sachverständige und eine Partnerkanzlei für Verkehrsrecht werden alle nach §249 BGB zustehenden Ansprüche durchgesetzt — kostenfrei für unverschuldet Geschädigte (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
    foundingDate: '2025',
    foundingLocation: {
      '@type': 'Place',
      name: 'Köln, Deutschland',
    },
    address: {
      '@type': 'PostalAddress',
      ...HQ_LOCATION,
    },
    email: CONTACT_EMAIL,
    telephone: PHONE_E164,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: PHONE_E164,
      contactType: 'customer service',
      areaServed: 'DE',
      availableLanguage: ['de', 'en', 'tr', 'ar', 'pl', 'ru'],
    },
    founder: FOUNDERS.map((f) => ({
      '@type': 'Person',
      name: f.name,
      jobTitle: f.jobTitle,
      sameAs: f.sameAs,
      image: f.image,
    })),
    // GEO-relevant: knowsAbout signalisiert ChatGPT/Perplexity/Claude die
    // Themen-Domäne für Zitierungen.
    knowsAbout: [
      'Kfz-Schadensregulierung',
      'Unfallgutachten',
      '§249 BGB',
      'Wertminderung',
      'BVSK-Honorartabelle',
      'Sicherungsabtretung §164 BGB',
      'DAT-Expert-Sachverständige',
      'Verkehrsrecht',
      'Haftpflichtschaden',
      'Nutzungsausfall',
      'Mietwagen-Anspruch',
      'BGH-Rechtsprechung Verkehrsunfall',
    ],
    // Vertrauenssignale: bekannte Partner als Schema-Verknüpfung
    memberOf: [
      {
        '@type': 'Organization',
        name: 'DAT Expert Partner Netzwerk',
        url: 'https://www.dat.de/sachverstaendige/',
      },
    ],
    // sameAs: externe verifizierbare Profile für GEO/Knowledge-Graph-Linkage.
    // Wikidata-Q-ID nachtragen sobald Eintrag angelegt (GEO-Fahrplan-Maßnahme 1
    // aus Notion — Aaron-Aufgabe). Erweiterung: BVSK-Verzeichnis, Anwalt.de,
    // Provenexpert-Profil sobald gepflegt.
    sameAs: [
      'https://www.linkedin.com/company/claimondo',
      // TODO Aaron: Wikidata-Eintrag anlegen, dann hier Q-ID einsetzen:
      // 'https://www.wikidata.org/wiki/Q<XXXXXXX>',
    ],
  }
}

// LocalBusiness — kritisch für lokale Suche + Google Maps
export function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    '@id': `${SITE_URL}/#localbusiness`,
    name: SITE_NAME,
    image: `${SITE_URL}/brand/logo-mark.svg`,
    url: SITE_URL,
    telephone: PHONE_E164,
    email: CONTACT_EMAIL,
    priceRange: '€€',
    address: {
      '@type': 'PostalAddress',
      ...HQ_LOCATION,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 50.9413,
      longitude: 6.9583,
    },
    areaServed: [
      {
        '@type': 'Country',
        name: 'Deutschland',
      },
      ...SERVED_CITIES.map((city) => ({
        '@type': 'City',
        name: city,
      })),
    ],
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '08:00',
        closes: '20:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Saturday', 'Sunday'],
        opens: '09:00',
        closes: '18:00',
      },
    ],
    // aggregateRating: erst hinzufügen wenn echte Trustpilot/Google-Reviews vorliegen.
    // Schema.org-Spam-Strafe wenn ohne Belege ausgeliefert.
  }
}

// Service Schema — für /vorteile, /wie-es-funktioniert
export function serviceSchema(args: {
  name: string
  description: string
  url: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: args.name,
    description: args.description,
    url: args.url,
    provider: {
      '@id': `${SITE_URL}/#organization`,
    },
    serviceType: 'Kfz-Schadensregulierung',
    areaServed: {
      '@type': 'Country',
      name: 'Deutschland',
    },
    audience: {
      '@type': 'Audience',
      audienceType: 'Unverschuldet Unfallgeschädigte',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      description:
        'Kostenfrei für unverschuldet Geschädigte — alle Kosten trägt die gegnerische Haftpflichtversicherung gemäß §249 BGB.',
    },
  }
}

// FAQPage — Princeton GEO: +40% AI-Visibility
export function faqPageSchema(faqs: Array<{ frage: string; antwort: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.frage,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.antwort,
      },
    })),
  }
}

// BreadcrumbList — Sitelinks in Suchergebnissen
export function breadcrumbsSchema(crumbs: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url.startsWith('http') ? c.url : `${SITE_URL}${c.url}`,
    })),
  }
}

// WebSite — aktiviert Google Sitelinks-Searchbox
export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: 'de-DE',
    publisher: {
      '@id': `${SITE_URL}/#organization`,
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/suche?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

// HowTo-Schema — Google Rich-Result für Schritt-für-Schritt-Anleitungen.
// Auf /wie-es-funktioniert. Princeton GEO: Statistics-Addition + HowTo
// = sehr hohe Citation-Wahrscheinlichkeit in AI-Antworten.
export function howToSchema(args: {
  name: string
  description: string
  totalTime?: string  // ISO 8601 Duration z.B. "PT15M"
  estimatedCost?: { currency: string; value: string }
  schritte: Array<{ name: string; text: string; image?: string }>
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: args.name,
    description: args.description,
    ...(args.totalTime && { totalTime: args.totalTime }),
    ...(args.estimatedCost && {
      estimatedCost: {
        '@type': 'MonetaryAmount',
        currency: args.estimatedCost.currency,
        value: args.estimatedCost.value,
      },
    }),
    step: args.schritte.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      ...(s.image && { image: s.image }),
    })),
  }
}

// Article-Schema — für Reports, Long-Form-Content, News.
// Princeton GEO: Article mit datePublished + author + Statistics-Density
// hat hohe Citation-Wahrscheinlichkeit in AI-Antworten.
export function articleSchema(args: {
  headline: string
  description: string
  datePublished: string
  dateModified?: string
  url: string
  image?: string
  authorName?: string
  wordCount?: number
  /** Strings wie „BGH VI ZR 65/18" — werden als `citation: CreativeWork[]`
   * ausgeliefert. Für AI-Engines + Google relevant: legt offen welche
   * Primärquellen der Artikel referenziert. */
  citation?: string[]
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: args.headline,
    description: args.description,
    datePublished: args.datePublished,
    dateModified: args.dateModified ?? args.datePublished,
    url: args.url,
    ...(args.image && { image: args.image }),
    author: {
      '@type': args.authorName ? 'Person' : 'Organization',
      name: args.authorName ?? SITE_NAME,
      ...(args.authorName ? {} : { url: SITE_URL }),
    },
    publisher: { '@id': `${SITE_URL}/#organization` },
    ...(args.wordCount && { wordCount: args.wordCount }),
    ...(args.citation && args.citation.length > 0 && {
      citation: args.citation.map((c) => ({
        '@type': 'CreativeWork',
        name: c,
      })),
    }),
    inLanguage: 'de-DE',
  }
}

/**
 * Auto-Schema-@graph für Content-Assets OHNE handgepflegten Schema-Block (Stream E):
 * Article (+ speakable) + FAQPage aus den Body-Q&A. Gibt null zurück, wenn keine
 * FAQ-Paare vorliegen (Caller fällt dann auf das reine articleSchema zurück) — und
 * bei jedem Fehler (try/catch, Doc 31 R2: invalides FAQ-Markup darf den Build nie brechen).
 *
 * speakable zielt auf H1/H2 + `.citation-box` (Stream-D-Klasse, am Kopf jeder Spoke
 * mit den 4 zitierfähigen Fakten) — Voice-Assistenten lesen Titel + Kernfakten vor.
 */
export function autoSchemaGraph(
  article: Parameters<typeof articleSchema>[0],
  faqPairs: Array<{ question: string; answer: string }>,
): string | null {
  try {
    if (!faqPairs.length) return null
    const articleNode = articleSchema(article) as Record<string, unknown>
    delete articleNode['@context'] // im @graph trägt nur der Wrapper @context
    articleNode.speakable = { '@type': 'SpeakableSpecification', cssSelector: ['h1', 'h2', '.citation-box'] }
    const faqNode = faqPageSchema(
      faqPairs.map((p) => ({ frage: p.question, antwort: p.answer })),
    ) as Record<string, unknown>
    delete faqNode['@context']
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': [articleNode, faqNode] })
  } catch {
    return null
  }
}

// Dataset-Schema — für Original-Daten-Veröffentlichungen (Schadensreport).
// AI-Suchmaschinen zitieren Datasets häufig direkt als Quelle.
export function datasetSchema(args: {
  name: string
  description: string
  url: string
  datePublished: string
  keywords?: string[]
  measurementTechnique?: string
  variableMeasured?: string[]
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: args.name,
    description: args.description,
    url: args.url,
    datePublished: args.datePublished,
    creator: { '@id': `${SITE_URL}/#organization` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    license: `${SITE_URL}/datenschutz`,
    inLanguage: 'de-DE',
    ...(args.keywords && { keywords: args.keywords.join(', ') }),
    ...(args.measurementTechnique && { measurementTechnique: args.measurementTechnique }),
    ...(args.variableMeasured && { variableMeasured: args.variableMeasured }),
  }
}

// Person-Schema — für About-Us-Page einzeln nutzbar.
export function personSchema(args: {
  name: string
  jobTitle: string
  description?: string
  image?: string
  sameAs?: string[]
  worksFor?: { name: string; url: string }
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: args.name,
    jobTitle: args.jobTitle,
    ...(args.description && { description: args.description }),
    ...(args.image && { image: args.image }),
    ...(args.sameAs && { sameAs: args.sameAs }),
    ...(args.worksFor && {
      worksFor: {
        '@type': 'Organization',
        name: args.worksFor.name,
        url: args.worksFor.url,
      },
    }),
  }
}

// Render-Helper — gibt einen <script>-Tag-String mit dem JSON-LD aus
export function jsonLdScript(data: object | object[]) {
  return {
    __html: JSON.stringify(data, null, 0),
  }
}
