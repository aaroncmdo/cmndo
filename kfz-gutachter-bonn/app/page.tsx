import type { Metadata } from 'next'
import { LandingPage } from '@/components/LandingPage'
import { MAIN_CITY } from '@/lib/cluster'
import { metadataForCity } from '@/lib/seo'

// ISR (18.08.2026): Die Ortstiefe aus stadt_lokalinhalte kommt zur Laufzeit aus
// der DB. Ohne revalidate waere sie beim Deploy eingefroren — jeder neue
// freigegebene Inhalt braeuchte einen Redeploy, und "automatischer Content"
// waere keiner. Stuendlich, wie die Stadtseiten auf claimondo.de.
export const revalidate = 3600


// Hub = Hauptstadt des Clusters (Wuppertal). canonical "/".
export const metadata: Metadata = metadataForCity(MAIN_CITY, 'hub')

export default function HomePage() {
  return <LandingPage city={MAIN_CITY} route="hub" />
}
