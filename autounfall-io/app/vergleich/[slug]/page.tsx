import type { Metadata } from 'next'
import { RestRoute } from '@/components/rest/RestRoute'
import { restMetadata, getRestSlugsUnder } from '@/lib/rest'

export const dynamicParams = false

export function generateStaticParams() {
  return getRestSlugsUnder('vergleich').map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  // noindex (Footprint-Schutz, Entscheidung Aaron 2026-06-15): Seite bleibt live +
  // crawlbar, aber NICHT im Google-Index. follow=true → interner Linkfluss bleibt.
  return { ...restMetadata('/vergleich/' + slug), robots: { index: false, follow: true } }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <RestRoute route={'/vergleich/' + slug} />
}
