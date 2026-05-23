import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { MarkdownRenderer } from '@/components/content/MarkdownRenderer'
import { AssetHero } from '@/components/content/AssetHero'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import { RelatedAssets } from '@/components/content/RelatedAssets'
import { ContentJsonLd } from '@/components/content/ContentJsonLd'
import {
  getDecoder,
  extractSchemaJson,
  stripSchemaSection,
  stripLeadingSnippet,
  extractTrustChips,
  readingTimeMin,
} from '@/lib/content/claimondo-mdx'
import { SITE_URL, WHATSAPP_HREF } from '@/lib/seo/jsonld'

const WA = WHATSAPP_HREF

// Fixe Content-Menge: nur die per generateStaticParams bekannten Slugs existieren.
// Unbekannte Slugs -> echter 404 am Router (kein Soft-404), statt die Seite zu rendern.
export const dynamicParams = false

export function generateStaticParams() {
  return getDecoder().map((a) => ({ slug: a.slug }))
}

function getAsset(slug: string) {
  return getDecoder().find((a) => a.slug === slug)
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

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <ContentJsonLd
        schemaJson={extractSchemaJson(a.body)}
        fallback={{ headline: a.title, description: a.snippet, datePublished: a.lastModified.toISOString(), url: `${SITE_URL}${a.url}` }}
        crumbs={[
          { name: 'Start', url: '/' },
          { name: 'Versicherer-Brief-Decoder', url: '/kfz-haftpflicht-schaden' },
          { name: a.title, url: a.url },
        ]}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[820px] px-6 py-10">
        <AssetHero
          title={a.title}
          snippet={a.snippet}
          clusterLabel="Versicherer-Brief-Decoder"
          trustChips={extractTrustChips(a.body)}
          lastModified={a.lastModified}
          readingMin={readingTimeMin(a.body)}
        />
        <article className="pt-8">
          <MarkdownRenderer body={cleaned} />
          <ConversionAnchorBlock variant="decoder" />
          <RelatedAssets current={a} />
        </article>
      </main>
      <LandingFooter />
      <StickyCallBar quelle={`Decoder: ${a.slug}`} whatsappHref={WA} />
    </div>
  )
}
