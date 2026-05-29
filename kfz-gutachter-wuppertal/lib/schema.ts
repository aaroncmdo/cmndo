import { SITE } from './site'
import { CLUSTER, type City } from './cluster'
import { FAQ, fillTokens } from './content'
import { canonicalPath } from './seo'

// JSON-LD-Builder · AutomotiveBusiness (LocalBusiness), FAQPage, BreadcrumbList.
// Telefon = einheitliche Nummer (Handoff). geo = stadt-spezifisch (Uniqueness).
// Adresse = Betreiber-HQ (Koeln) — kein lokales Buero. aggregateRating 5,0/7
// (Quelle Google-Bewertungen, im UI sichtbar belegt — UWG).

function absoluteUrl(path: string): string {
  return `${SITE.url}${path}`
}

export function localBusinessSchema(city: City, route: 'hub' | 'spoke') {
  const url = absoluteUrl(canonicalPath(city, route))
  return {
    '@context': 'https://schema.org',
    '@type': 'AutomotiveBusiness',
    name: `Kfz-Gutachter ${city.name} – Claimondo-Partner`,
    image: `${SITE.url}${CLUSTER.imgPath}hero-${CLUSTER.key}.webp`,
    logo: `${SITE.url}${CLUSTER.imgPath}logo-${CLUSTER.key}.png`,
    url,
    telephone: CLUSTER.phone.tel,
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE.operator.street,
      addressLocality: SITE.operator.city,
      postalCode: SITE.operator.postalCode,
      addressRegion: 'NRW',
      addressCountry: SITE.operator.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: city.lat, longitude: city.lng },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: '00:00',
        closes: '23:59',
      },
    ],
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', bestRating: '5', ratingCount: '7' },
    areaServed: CLUSTER.cities.map((c) => ({ '@type': 'City', name: c.name })),
  }
}

export function faqSchema(city: City) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: fillTokens(item.q, city, CLUSTER.region),
      acceptedAnswer: { '@type': 'Answer', text: fillTokens(item.a, city, CLUSTER.region) },
    })),
  }
}

export function breadcrumbSchema(city: City, route: 'hub' | 'spoke') {
  const items = [
    { '@type': 'ListItem', position: 1, name: 'Start', item: absoluteUrl('/') },
    { '@type': 'ListItem', position: 2, name: `${CLUSTER.region} · Städte-Übersicht`, item: absoluteUrl('/') },
    { '@type': 'ListItem', position: 3, name: city.name, ...(route === 'spoke' && !city.main ? { item: absoluteUrl(`/lp/${city.slug}`) } : {}) },
  ]
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items }
}
