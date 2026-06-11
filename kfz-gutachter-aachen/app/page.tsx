import type { Metadata } from 'next'
import { LandingPage } from '@/components/LandingPage'
import { MAIN_CITY } from '@/lib/cluster'
import { metadataForCity } from '@/lib/seo'

// Hub = Hauptstadt des Clusters (Wuppertal). canonical "/".
export const metadata: Metadata = metadataForCity(MAIN_CITY, 'hub')

export default function HomePage() {
  return <LandingPage city={MAIN_CITY} route="hub" />
}
