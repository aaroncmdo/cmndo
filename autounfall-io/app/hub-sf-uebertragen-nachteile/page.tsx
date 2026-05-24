import type { Metadata } from 'next'
import { RestRoute } from '@/components/rest/RestRoute'
import { restMetadata } from '@/lib/rest'

export function generateMetadata(): Metadata {
  return restMetadata('/hub-sf-uebertragen-nachteile')
}

export default function Page() {
  return <RestRoute route="/hub-sf-uebertragen-nachteile" />
}
