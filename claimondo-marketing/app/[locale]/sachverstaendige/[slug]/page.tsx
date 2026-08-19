import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { MarkdownRenderer } from '@/components/content/MarkdownRenderer'
import { AssetHero } from '@/components/content/AssetHero'
import { TableOfContents } from '@/components/content/TableOfContents'
import { RelatedAssets } from '@/components/content/RelatedAssets'
import { ArticleComments } from '@/components/community/ArticleComments'
import { InlineCheckCta } from '@/components/content/InlineCheckCta'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ContentJsonLd } from '@/components/content/ContentJsonLd'
import { FaqStems } from '@/components/content/FaqStems'
import { VrBaitBlock } from '@/components/content/VrBaitBlock'
import { FAQ_STEMS_MAPPING } from '@/data/faq-stems-mapping'
import { VR_BAIT_MAPPING } from '@/data/vr-bait-mapping'
import { CitationBox } from '@/components/content/CitationBox'
import { getMappingFor } from '@/data/citation-box-mapping'
import { getFakten } from '@/lib/seo/brand-fakten-library'
import {
  metaDescriptionFromSnippet,
  getSachverstaendige,
  clusterLabel,
  extractSchemaJson,
  stripSchemaSection,
  stripLeadingSnippet,
  extractHeadings,
  extractTrustChips,
  extractCitations,
  readingTimeMin,
} from '@/lib/content/claimondo-mdx'
import { SITE_URL, WHATSAPP_HREF, OG_DEFAULT_IMAGES } from '@/lib/seo/jsonld'

const WA = WHATSAPP_HREF

// Unbekannte Slugs -> echter 404 am Router (kein Soft-404).
// Voll dynamisch: das [locale]-Layout nutzt headers() (Tracking) -> SSG nicht moeglich (DYNAMIC_SERVER_USAGE). Daher KEIN generateStaticParams; notFound() unten faengt unbekannte Slugs (404). On-demand-Render aus STAEDTE/MDX.

function getAsset(slug: string) {
  return getSachverstaendige().find((a) => a.slug === slug)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = getAsset(slug)
  if (!a) return {}
  return {
    // Kurzer SERP-Titel wenn im Frontmatter gesetzt; sonst die H1 (= a.title).
    // openGraph.title unten behaelt bewusst den vollen Titel — dort ist mehr Platz.
    title: a.metaTitle || a.title,
    description: a.metaDescription || metaDescriptionFromSnippet(a.snippet) || a.title,
    alternates: { canonical: a.url },
    openGraph: {
      type: 'article',
      url: `${SITE_URL}${a.url}`,
      title: a.title,
      description: a.metaDescription || metaDescriptionFromSnippet(a.snippet),
      locale: 'de_DE',
      siteName: 'Claimondo',

      images: OG_DEFAULT_IMAGES,
    },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = getAsset(slug)
  if (!a) notFound()

  const cleaned = stripLeadingSnippet(stripSchemaSection(a.body))
  const headings = extractHeadings(cleaned)

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <ContentJsonLd
        schemaJson={extractSchemaJson(a.body)}
        fallback={{ headline: a.title, description: a.metaDescription || metaDescriptionFromSnippet(a.snippet), datePublished: a.lastModified.toISOString(), dateModified: a.lastModified.toISOString(), url: `${SITE_URL}${a.url}`, citations: extractCitations(a.body) }}
        crumbs={[
          { name: 'Start', url: '/' },
          { name: 'Sachverständige', url: '/sachverstaendige' },
          { name: a.title, url: a.url },
        ]}
        body={a.body}
        faqStems={FAQ_STEMS_MAPPING[a.slug] ?? []}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[1140px] px-6 py-10">
        <AssetHero
          title={a.title}
          snippet={a.snippet}
          clusterLabel={a.cluster ? `${a.cluster} · ${clusterLabel(a.cluster).split(' (')[0]}` : undefined}
          trustChips={extractTrustChips(a.body)}
          lastModified={a.lastModified}
          readingMin={readingTimeMin(a.body)}
        />
        <CitationBox sentences={getFakten(getMappingFor(a.slug))} />
        <div className="grid grid-cols-1 gap-12 pt-9 lg:grid-cols-[230px_1fr]">
          <TableOfContents headings={headings} />
          <article>
            <MarkdownRenderer body={cleaned} pageHasOwnH1 />
            <FaqStems stems={FAQ_STEMS_MAPPING[a.slug] ?? []} />
            <VrBaitBlock items={VR_BAIT_MAPPING[a.slug] ?? []} />
            <ConversionAnchorBlock variant="spoke" />
            <InlineCheckCta />
            <RelatedAssets current={a} />
            <ArticleComments articleSlug={`sachverstaendige/${slug}`} />
          </article>
        </div>
        <SpokeCtaBand />
      </main>
      <LandingFooter />
      <StickyCallBar quelle={`Sachverständige: ${a.slug}`} whatsappHref={WA} />
    </div>
  )
}
