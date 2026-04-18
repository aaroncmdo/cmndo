// AAR-484 (M2): Makler-Dashboard — Server-Entry. Layout garantiert bereits
// dass der User existiert und Makler-Rolle + aktiven Status hat. Daten
// werden parallel via getMaklerDashboardData geladen.

import { getCurrentMakler, getMaklerDashboardData } from '@/lib/makler/queries'
import { MaklerDashboard } from '@/components/makler/MaklerDashboard'

export const dynamic = 'force-dynamic'

export default async function MaklerDashboardPage() {
  const makler = await getCurrentMakler()
  if (!makler) return null // Layout redirectet bei null eigentlich schon

  const data = await getMaklerDashboardData(makler.id)

  return <MaklerDashboard makler={makler} data={data} />
}
