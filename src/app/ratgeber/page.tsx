import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { MarkdownRenderer } from '@/components/content/MarkdownRenderer'
import { AssetHero } from '@/components/content/AssetHero'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ContentJsonLd } from '@/components/content/ContentJsonLd'
import {
  getCornerstones,
  extractSchemaJson,
  stripSchemaSection,
  stripLeadingSnippet,
  extractTrustChips,
  readingTimeMin,
} from '@/lib/content/claimondo-mdx'
import { SITE_URL, WHATSAPP_HREF } from '@/lib/seo/jsonld'

const SLUG = 'ratgeber'
const WA = WHATSAPP_HREF

function getAsset() {
  return getCornerstones().find((a) => a.slug === SLUG)
}

export function generateMetadata(): Metadata {
  const a = getAsset()
  if (!a) return {}
  return {
    title: `${a.title} · Claimondo`,
    description: a.snippet || a.title,
    alternates: { canonical: `/${SLUG}` },
    openGraph: {
      type: 'article',
      url: `${SITE_URL}/${SLUG}`,
      title: a.title,
      description: a.snippet,
      locale: 'de_DE',
      siteName: 'Claimondo',
    },
  }
}

export default function Page() {
  const a = getAsset()
  if (!a) notFound()

  const cleaned = stripLeadingSnippet(stripSchemaSection(a.body))

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <ContentJsonLd
        schemaJson={extractSchemaJson(a.body)}
        fallback={{ headline: a.title, description: a.snippet, datePublished: a.lastModified.toISOString(), url: `${SITE_URL}${a.url}` }}
        crumbs={[
          { name: 'Start', url: '/' },
          { name: a.title, url: a.url },
        ]}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[1040px] px-6 py-10">
        <AssetHero
          title={a.title}
          snippet={a.snippet}
          trustChips={extractTrustChips(a.body)}
          lastModified={a.lastModified}
          readingMin={readingTimeMin(a.body)}
        />
        <article className="pt-2">
          <MarkdownRenderer body={cleaned} />
          <ConversionAnchorBlock variant="cornerstone" />
        </article>
        <SpokeCtaBand headline="Unverschuldeter Unfall? Wir regeln deinen ganzen Schaden." />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Cornerstone: Ratgeber" whatsappHref={WA} />
    </div>
  )
}
