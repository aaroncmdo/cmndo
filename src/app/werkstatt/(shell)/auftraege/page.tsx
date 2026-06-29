// Werkstatt-Portal: „Reparatur-Aufträge" — zur Reparatur zugewiesene Fälle (Outbound-Flow
// der Finder-Session: claims.reparatur_werkstatt_id) via self-scoped RPC. Leak-safe.

import { redirect } from 'next/navigation'
import { getWerkstattByUserId } from '@/lib/werkstatt/queries'
import { getWerkstattReparaturAuftraege } from '@/lib/werkstatt/reparatur-auftraege'
import { WerkstattReparaturAuftraege } from '@/components/werkstatt/WerkstattReparaturAuftraege'

export const dynamic = 'force-dynamic'

export default async function WerkstattReparaturAuftraegePage() {
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const auftraege = await getWerkstattReparaturAuftraege()

  return <WerkstattReparaturAuftraege auftraege={auftraege} werkstattName={werkstatt.name} />
}
