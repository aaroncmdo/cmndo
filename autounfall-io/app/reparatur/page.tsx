import type { Metadata } from 'next'
import { RestRoute } from '@/components/rest/RestRoute'
import { restMetadata } from '@/lib/rest'

export function generateMetadata(): Metadata {
  return restMetadata('/reparatur')
}

export default function Page() {
  return <RestRoute route="/reparatur" />
}
