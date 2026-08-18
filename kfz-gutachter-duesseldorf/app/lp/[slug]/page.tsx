import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LandingPage } from '@/components/LandingPage'
import { SPOKE_SLUGS, getCity } from '@/lib/cluster'
import { metadataForCity } from '@/lib/seo'

// ISR (18.08.2026): Die Ortstiefe aus stadt_lokalinhalte kommt zur Laufzeit aus
// der DB. Ohne revalidate waere sie beim Deploy eingefroren — jeder neue
// freigegebene Inhalt braeuchte einen Redeploy, und "automatischer Content"
// waere keiner. Stuendlich, wie die Stadtseiten auf claimondo.de.
export const revalidate = 3600


// Statische Spoke-Pages fuer alle Staedte AUSSER der Hauptstadt (= Hub "/").
export function generateStaticParams() {
  return SPOKE_SLUGS.map((slug) => ({ slug }))
}

// Unbekannte Slugs → 404 (kein Doorway-Wildwuchs).
export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const city = getCity(slug)
  if (!city) return {}
  return metadataForCity(city, 'spoke')
}

export default async function SpokePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const city = getCity(slug)
  if (!city) notFound()
  return <LandingPage city={city} route="spoke" />
}
