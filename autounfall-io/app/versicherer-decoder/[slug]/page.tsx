import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDecoder, getDecoderSlugs } from '@/lib/decoders'
import { siteGraph, decoderGraph } from '@/lib/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { DecoderArticle } from '@/components/decoder/DecoderArticle'

export const dynamicParams = false

export function generateStaticParams() {
  return getDecoderSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const d = getDecoder(slug)
  if (!d) return {}
  const url = `/versicherer-decoder/${d.slug}`
  return {
    title: d.title,
    description: d.metaDesc,
    alternates: { canonical: url },
    openGraph: { type: 'article', url, title: d.title, description: d.metaDesc },
    twitter: { card: 'summary_large_image', title: d.title, description: d.metaDesc },
  }
}

export default async function DecoderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const d = getDecoder(slug)
  if (!d) notFound()
  return (
    <>
      <JsonLd data={siteGraph(decoderGraph(d))} />
      <DecoderArticle decoder={d} />
    </>
  )
}
