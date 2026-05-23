import { SITE } from '@/lib/site'

// JSON-LD-Graph-Builder · STANDALONE (ENTITY-MODELL-LOCK v2).
// publisher/author = ausschliesslich Kitta & Sprafke UG. #legal-reviewer =
// LexDrive UG (bleibt benannt). KEIN #partner-service / Claimondo, KEINE
// claimondo.de-URLs in url/sameAs/image.

type JsonLdNode = Record<string, unknown>

const ORG_ID = `${SITE.url}/#publisher`
const LEGAL_REVIEWER_ID = `${SITE.url}/#legal-reviewer`
const WEBSITE_ID = `${SITE.url}/#website`

/** Betreiber / publisher / author-Affiliation — nur Kitta & Sprafke UG. */
export function organizationSchema(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.publisher.name,
    url: SITE.url,
    logo: `${SITE.url}/favicon.svg`,
  }
}

/** Partnerkanzlei — #legal-reviewer bleibt benannt (Aaron-Entscheidung 2026-05-23). */
export function legalReviewerSchema(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': LEGAL_REVIEWER_ID,
    name: SITE.legalReviewer.name,
  }
}

export function websiteSchema(): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE.url,
    name: SITE.name,
    inLanguage: 'de-DE',
    publisher: { '@id': ORG_ID },
  }
}

/**
 * Site-weiter Standard-Graph fuer das Root-Layout.
 * `extra` haengt seitenspezifische Knoten an (Article/FAQPage/HowTo in WP-2/3),
 * deren author/publisher per @id auf #publisher referenzieren — nie auf Claimondo.
 */
export function siteGraph(extra: JsonLdNode[] = []): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@graph': [organizationSchema(), legalReviewerSchema(), websiteSchema(), ...extra],
  }
}
