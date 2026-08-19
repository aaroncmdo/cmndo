import { SITE } from './site'
import { CLUSTER, type City } from './cluster'
import { FAQ, GOOGLE_RATING, fillTokens, faqAnswerText } from './content'
import { LOKALDATEN } from './lokaldaten'
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
        // 24/7: Googles empfohlenes Pattern fuer durchgehend geoeffnet ist 00:00–23:59
        // (24:00 ist zwar ISO-8601, wird aber von manchen Validatoren als out-of-range gewarnt).
        closes: '23:59',
      },
    ],
    // BRIEF 08i: ratingCount aus dem GBP-Datenfeld (echte Gesamtzahl, kein Hardcode).
    aggregateRating: { '@type': 'AggregateRating', ratingValue: GOOGLE_RATING.value, bestRating: '5', ratingCount: String(GOOGLE_RATING.gbpReviewCount) },
    areaServed: CLUSTER.cities.map((c) => ({ '@type': 'City', name: c.name })),
  }
}

export function faqSchema(city: City) {
  // 08l A4: FAQ-Schema umfasst lokale (Position 1+2, Daten-Layer) + generische
  // Fragen — synchron zur Render-Reihenfolge im Accordion.
  const lokal = (LOKALDATEN[city.slug]?.faqLokal ?? []).map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  }))
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    // Aktualitaets-Signal: FAQPage ist ein WebPage-Subtyp, dateModified dort gueltig.
    // Quelle ist die gepflegte Konstante in site.ts (kein new Date()).
    dateModified: SITE.contentLastUpdated,
    mainEntity: [
      ...lokal,
      ...FAQ.map((item) => ({
        '@type': 'Question',
        name: fillTokens(item.q, city, CLUSTER.region),
        acceptedAnswer: { '@type': 'Answer', text: faqAnswerText(item, city, CLUSTER.region, LOKALDATEN[city.slug]?.achsen ?? CLUSTER.achsen.join(' · ')) },
      })),
    ],
  }
}

export function breadcrumbSchema(city: City, route: 'hub' | 'spoke') {
  // Audit-Fix 15.06.: vorher zeigten Position 1 (Start) + 2 (Städte-Übersicht) auf
  // dieselbe URL "/" (degenerierter Breadcrumb, Validator-Warning). Jetzt 2 Ebenen:
  // Start (/) › Stadt (Spoke-URL bzw. aktuelle Seite = ohne item).
  const items = [
    { '@type': 'ListItem', position: 1, name: 'Start', item: absoluteUrl('/') },
    { '@type': 'ListItem', position: 2, name: city.name, ...(route === 'spoke' && !city.main ? { item: absoluteUrl(`/lp/${city.slug}`) } : {}) },
  ]
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items }
}

export function serviceSchema(city: City) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Kfz-Schadensgutachten',
    name: `Kfz-Gutachten ${city.name}`,
    provider: {
      '@type': 'AutomotiveBusiness',
      name: `Kfz-Gutachter ${city.name} – Claimondo-Partner`,
      telephone: CLUSTER.phone.tel,
    },
    areaServed: { '@type': 'City', name: city.name },
    category: 'Schadensgutachten',
  }
}

// Person-Schema · lokaler Sachverstaendiger (Persona). Name = Vorname + Nachname
// aus CLUSTER (z.B. "Stefan Wagner"). Cluster-level (Hub + alle Spokes identisch).
export function personSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: `${CLUSTER.svName} ${CLUSTER.svSurname}`,
    jobTitle: 'Kfz-Sachverständiger',
    worksFor: {
      '@type': 'Organization',
      name: 'Claimondo Partner-Netzwerk',
      url: 'https://app.claimondo.de',
    },
    knowsAbout: ['Kfz-Schadengutachten', 'Unfallgutachten', 'Wertgutachten', 'BVSK', 'BVSK-Standard'],
    areaServed: { '@type': 'AdministrativeArea', name: CLUSTER.region },
  }
}
