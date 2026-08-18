import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { MarkdownRenderer } from '@/components/content/MarkdownRenderer'
import { AssetHero } from '@/components/content/AssetHero'
import { TableOfContents } from '@/components/content/TableOfContents'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ContentJsonLd } from '@/components/content/ContentJsonLd'
import {
  metaDescriptionFromSnippet,
  stripSchemaSection,
  stripLeadingSnippet,
  extractHeadings,
  extractTrustChips,
  extractCitations,
  readingTimeMin,
  extractFaqPairs,
} from '@/lib/content/claimondo-mdx'
import { getPublishedArtikelBySlug } from '@/lib/wissen/db-articles'
import { SITE_URL, WHATSAPP_HREF, articleSchema, autoSchemaGraph } from '@/lib/seo/jsonld'
import { FOUNDER_AARON_NAME } from '@/lib/seo/brand-constants'
import { ArticleComments } from '@/components/community/ArticleComments'

const WA = WHATSAPP_HREF

// Vollständig dynamisch — kein generateStaticParams (Artikel kommen aus der DB,
// kein Build-Zeit-Snapshot). notFound() greift bei unbekanntem / unveröffentlichtem Slug.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = await getPublishedArtikelBySlug(slug)
  if (!a) return {}

  const description =
    a.meta_description ||
    (a.excerpt ? metaDescriptionFromSnippet(a.excerpt) : null) ||
    a.title

  return {
    title: a.title,
    description,
    alternates: { canonical: `/wissen/${slug}` },
    openGraph: {
      type: 'article',
      url: `${SITE_URL}/wissen/${slug}`,
      title: a.title,
      description: description ?? undefined,
      locale: 'de_DE',
      siteName: 'Claimondo',
    },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = await getPublishedArtikelBySlug(slug)
  if (!a) notFound()

  // Body aufbereiten: Schema-Sektion + führendes Snippet-Blockquote entfernen
  const cleaned = stripLeadingSnippet(stripSchemaSection(a.body))
  const headings = extractHeadings(cleaned)

  // Datum-Hierarchie: last_modified (date string) > veroeffentlicht_am (timestamptz ISO) > Fallback
  const lastModifiedDate: Date = (() => {
    if (a.last_modified) {
      const d = new Date(a.last_modified)
      if (!Number.isNaN(d.getTime())) return d
    }
    if (a.veroeffentlicht_am) {
      const d = new Date(a.veroeffentlicht_am)
      if (!Number.isNaN(d.getTime())) return d
    }
    return new Date('2024-01-01T00:00:00Z')
  })()

  const dateIso = lastModifiedDate.toISOString()

  const description =
    a.meta_description ||
    (a.excerpt ? metaDescriptionFromSnippet(a.excerpt) : null) ||
    a.title

  // Article (Person=Aaron) + citation + speakable + FAQPage (aus der "## Häufige Fragen"-
  // Sektion des Bodys). autoSchemaGraph gibt null ohne FAQ-Paare -> Fallback aufs reine
  // articleSchema. FAQPage ist der GEO-Hebel, den die KI-Artikel bisher verschenkt haben.
  const articleArgs = {
    headline: a.title,
    description: description ?? a.title,
    datePublished: dateIso,
    dateModified: dateIso,
    url: `${SITE_URL}/wissen/${slug}`,
    citation: extractCitations(a.body),
    authorName: FOUNDER_AARON_NAME,
  }
  const articleJsonLd =
    autoSchemaGraph(articleArgs, extractFaqPairs(a.body)) ?? JSON.stringify(articleSchema(articleArgs))

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <ContentJsonLd
        schemaJson={articleJsonLd}
        fallback={{
          headline: a.title,
          description: description ?? a.title,
          datePublished: dateIso,
          dateModified: dateIso,
          url: `${SITE_URL}/wissen/${slug}`,
          citations: extractCitations(a.body),
        }}
        crumbs={[
          { name: 'Start', url: '/' },
          { name: 'Wissen', url: '/wissen' },
          { name: a.title, url: `/wissen/${slug}` },
        ]}
        body={a.body}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[1140px] px-6 py-10">
        <AssetHero
          title={a.title}
          snippet={a.excerpt ?? undefined}
          clusterLabel={a.cluster ?? undefined}
          trustChips={extractTrustChips(a.body)}
          lastModified={lastModifiedDate}
          readingMin={readingTimeMin(a.body)}
        />
        <div className="grid grid-cols-1 gap-12 pt-9 lg:grid-cols-[230px_1fr]">
          <TableOfContents headings={headings} />
          <article>
            <MarkdownRenderer body={cleaned} pageHasOwnH1 />
            <ArticleComments articleSlug={`wissen/${slug}`} />
          </article>
        </div>
        <SpokeCtaBand />
      </main>
      <LandingFooter />
      <StickyCallBar quelle={`Wissen: ${slug}`} whatsappHref={WA} />
    </div>
  )
}
