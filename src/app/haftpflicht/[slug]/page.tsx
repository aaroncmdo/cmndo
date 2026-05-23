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
import { FaqStems } from '@/components/content/FaqStems'
import { VrBaitBlock } from '@/components/content/VrBaitBlock'
import { FAQ_STEMS_MAPPING } from '@/data/faq-stems-mapping'
import { VR_BAIT_MAPPING } from '@/data/vr-bait-mapping'
import { CitationBox } from '@/components/content/CitationBox'
import { getMappingFor } from '@/data/citation-box-mapping'
import { getFakten } from '@/lib/seo/brand-fakten-library'
import {
  getHaftpflichtSpokes,
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
// Unbekannte Slugs -> echter 404 am Router (kein Soft-404), statt die Seite zu rendern.
export const dynamicParams = false

export function generateStaticParams() {
  return getHaftpflichtSpokes().map((a) => ({ slug: a.slug }))
}

function getAsset(slug: string) {
  return getHaftpflichtSpokes().find((a) => a.slug === slug)
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
          { name: 'Kfz-Haftpflichtschaden', url: '/kfz-haftpflicht-schaden' },
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
            <MarkdownRenderer body={cleaned} />
            <FaqStems stems={FAQ_STEMS_MAPPING[a.slug] ?? []} />
            <VrBaitBlock items={VR_BAIT_MAPPING[a.slug] ?? []} />
            <ConversionAnchorBlock variant="spoke" />
            <InlineCheckCta />
            <RelatedAssets current={a} />
          </article>
        </div>
        <SpokeCtaBand />
      </main>
      <LandingFooter />
      <StickyCallBar quelle={`Wissen: ${a.slug}`} whatsappHref={WA} />
    </div>
  )
}
