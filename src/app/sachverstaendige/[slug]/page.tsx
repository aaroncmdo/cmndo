import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { MarkdownRenderer } from '@/components/content/MarkdownRenderer'
import { AssetHero } from '@/components/content/AssetHero'
import { TableOfContents } from '@/components/content/TableOfContents'
import { RelatedAssets } from '@/components/content/RelatedAssets'
import { InlineCheckCta } from '@/components/content/InlineCheckCta'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ContentJsonLd } from '@/components/content/ContentJsonLd'
import {
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
import { SITE_URL, WHATSAPP_HREF } from '@/lib/seo/jsonld'

const WA = WHATSAPP_HREF

// Fixe Content-Menge: nur die per generateStaticParams bekannten Slugs existieren.
// Unbekannte Slugs -> echter 404 am Router (kein Soft-404).
export const dynamicParams = false

export function generateStaticParams() {
  return getSachverstaendige().map((a) => ({ slug: a.slug }))
}

function getAsset(slug: string) {
  return getSachverstaendige().find((a) => a.slug === slug)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = getAsset(slug)
  if (!a) return {}
  return {
    title: `${a.title} · Claimondo`,
    description: a.snippet || a.title,
    alternates: { canonical: a.url },
    openGraph: {
      type: 'article',
      url: `${SITE_URL}${a.url}`,
      title: a.title,
      description: a.snippet,
      locale: 'de_DE',
      siteName: 'Claimondo',
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
        fallback={{ headline: a.title, description: a.snippet, datePublished: a.lastModified.toISOString(), dateModified: a.lastModified.toISOString(), url: `${SITE_URL}${a.url}`, citations: extractCitations(a.body) }}
        crumbs={[
          { name: 'Start', url: '/' },
          { name: 'Sachverständige', url: '/sachverstaendige' },
          { name: a.title, url: a.url },
        ]}
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
        <div className="grid grid-cols-1 gap-12 pt-9 lg:grid-cols-[230px_1fr]">
          <TableOfContents headings={headings} />
          <article>
            <MarkdownRenderer body={cleaned} />
            <ConversionAnchorBlock variant="spoke" />
            <InlineCheckCta />
            <RelatedAssets current={a} />
          </article>
        </div>
        <SpokeCtaBand />
      </main>
      <LandingFooter />
      <StickyCallBar quelle={`Sachverständige: ${a.slug}`} whatsappHref={WA} />
    </div>
  )
}
