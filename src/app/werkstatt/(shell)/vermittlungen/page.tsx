// Werkstatt-Portal: „Meine Vermittlungen" — leak-safe Liste der eigenen KVA-Leads
// mit Funnel-Status (via self-scoped SECURITY-DEFINER-RPC get_werkstatt_vermittlungen).

import { redirect } from 'next/navigation'
import { getWerkstattByUserId, getWerkstattVermittlungen } from '@/lib/werkstatt/queries'
import { WerkstattVermittlungen } from '@/components/werkstatt/WerkstattVermittlungen'

export const dynamic = 'force-dynamic'

export default async function WerkstattVermittlungenPage() {
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const vermittlungen = await getWerkstattVermittlungen()

  return <WerkstattVermittlungen vermittlungen={vermittlungen} werkstattName={werkstatt.name} />
}
