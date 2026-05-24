import { notFound } from 'next/navigation'
import { getRestPage } from '@/lib/rest'
import { siteGraph, restGraph } from '@/lib/jsonld'
import { JsonLd } from '@/components/JsonLd'
import { RestArticle } from '@/components/rest/RestArticle'

// Server-Wrapper fuer eine WP-7-Route: laedt die RestPage per voller Route,
// rendert JSON-LD (restGraph) + RestArticle. Genutzt von allen statischen
// Segment-Seiten und den [slug]-Resolvern → eine einzige Render-Quelle.
export function RestRoute({ route }: { route: string }) {
  const page = getRestPage(route)
  if (!page) notFound()
  return (
    <>
      <JsonLd data={siteGraph(restGraph(page))} />
      <RestArticle page={page} />
    </>
  )
}
