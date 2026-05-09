// JSON-LD Schema-Helper für SEO + GEO-Optimierung
// Princeton GEO Research: FAQPage = +40% AI-Visibility, Citations = +40%
// Schema.org Templates für deutsche KFZ-Schadensregulierung

export const SITE_URL = 'https://claimondo.de'
export const SITE_NAME = 'Claimondo'
export const PHONE_E164 = '+4922125906530'
export const PHONE_DISPLAY = '0221 25906530'
export const CONTACT_EMAIL = 'kontakt@claimondo.de'

// Hauptstadt + Region für GEO-Targeting
// TODO Aaron: echte Adresse einsetzen — derzeit Platzhalter Köln-Mitte
const HQ_LOCATION = {
  streetAddress: 'Kaiser-Wilhelm-Ring 27-29',
  postalCode: '50672',
  addressLocality: 'Köln',
  addressRegion: 'NW',
  addressCountry: 'DE',
}

// Founder-Profile für E-E-A-T (Person-Schema)
// TODO Aaron: echte Bio-Texte + LinkedIn-URLs einsetzen — Texte sind Erstentwurf
const FOUNDERS = [
  {
    name: 'Nicolas Kitta',
    jobTitle: 'CEO & Mitgründer',
    sameAs: 'https://www.linkedin.com/in/nicolas-kitta-451947246/',
    image: `${SITE_URL}/brand/team-office.jpg`,
  },
  {
    name: 'Aaron Sprafke',
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
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon.svg`,
    description:
      'Claimondo regelt Kfz-Unfallschäden komplett: unabhängiges Gutachten, Anwalt, Werkstatt und Auszahlung — kostenfrei für unverschuldet Geschädigte nach §249 BGB.',
    foundingDate: '2025',
    address: {
      '@type': 'PostalAddress',
      ...HQ_LOCATION,
    },
    email: CONTACT_EMAIL,
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
    sameAs: [
      'https://www.linkedin.com/company/claimondo',
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

// Render-Helper — gibt einen <script>-Tag-String mit dem JSON-LD aus
export function jsonLdScript(data: object | object[]) {
  return {
    __html: JSON.stringify(data, null, 0),
  }
}
