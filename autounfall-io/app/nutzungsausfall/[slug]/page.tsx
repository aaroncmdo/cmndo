import type { Metadata } from 'next'
import { RestRoute } from '@/components/rest/RestRoute'
import { restMetadata, getRestSlugsUnder } from '@/lib/rest'

export const dynamicParams = false

export function generateStaticParams() {
  return getRestSlugsUnder('nutzungsausfall').map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return restMetadata('/nutzungsausfall/' + slug)
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <RestRoute route={'/nutzungsausfall/' + slug} />
}
