import { SITE } from '@/lib/site'
import { AUTHORS, type Article, type ArticleAuthorId } from '@/lib/article-types'

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
    url: SITE.legalReviewer.url,
    description: 'Partnerkanzlei für Verkehrsrecht.',
    areaServed: 'DE',
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

// ── Artikel-Knoten (WP-2) ───────────────────────────────────────────────────
// Person-Autor: worksFor → #publisher (Kitta & Sprafke UG), nur persönliche
// LinkedIn-sameAs, KEINE claimondo.de-URLs.
function personSchema(authorId: ArticleAuthorId): JsonLdNode {
  const a = AUTHORS[authorId]
  return {
    '@type': 'Person',
    '@id': `${SITE.url}/#author-${a.id}`,
    name: a.name,
    givenName: a.givenName,
    familyName: a.familyName,
    jobTitle: a.jobTitle,
    url: SITE.url,
    sameAs: a.sameAs,
    worksFor: { '@id': ORG_ID },
    knowsAbout: a.knowsAbout,
  }
}

function breadcrumbSchema(article: Article): JsonLdNode {
  const items = [{ name: 'Start', url: `${SITE.url}/` }]
  if (article.pillar) items.push({ name: article.pillar.name, url: `${SITE.url}/${article.pillar.slug}` })
  items.push({ name: article.h1Accent ?? article.title, url: `${SITE.url}/${article.slug}` })
  return {
    '@type': 'BreadcrumbList',
    '@id': `${SITE.url}/${article.slug}/#breadcrumb`,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  }
}

/**
 * Artikel-spezifische Knoten fuer siteGraph(extra):
 * Person(Autor) + Article + BreadcrumbList + (FAQPage) + (HowTo).
 * Article.author → Person, publisher → #publisher, reviewedBy → #legal-reviewer.
 * STANDALONE: kein #partner-service, keine claimondo.de-URLs.
 */
export function articleGraph(article: Article): JsonLdNode[] {
  const articleUrl = `${SITE.url}/${article.slug}`
  const nodes: JsonLdNode[] = [
    personSchema(article.author),
    {
      '@type': 'Article',
      '@id': `${articleUrl}/#article`,
      headline: article.title,
      description: article.description,
      url: articleUrl,
      datePublished: article.datePublished,
      dateModified: article.dateModified,
      author: { '@id': `${SITE.url}/#author-${article.author}` },
      publisher: { '@id': ORG_ID },
      reviewedBy: { '@id': LEGAL_REVIEWER_ID },
      inLanguage: 'de-DE',
      ...(article.hero ? { image: `${SITE.url}${article.hero.src}` } : {}),
      speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.quick-answer', 'h1'] },
    },
    breadcrumbSchema(article),
  ]
  if (article.faq?.length) {
    nodes.push({
      '@type': 'FAQPage',
      '@id': `${articleUrl}/#faq`,
      mainEntity: article.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    })
  }
  if (article.howto) {
    nodes.push({
      '@type': 'HowTo',
      '@id': `${articleUrl}/#howto`,
      name: article.howto.name,
      step: article.howto.steps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    })
  }
  return nodes
}
