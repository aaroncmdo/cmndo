// Werkstatt-Portal: „Offene Anfragen" — die eigenen noch nicht konvertierten
// Inbound-Leads (self-scoped via v_werkstatt_lead), von der Werkstatt bearbeitbar.

import { redirect } from 'next/navigation'
import { getWerkstattByUserId } from '@/lib/werkstatt/queries'
import { getWerkstattLeads } from '@/lib/werkstatt/leads-queries'
import { WerkstattAnfragen } from '@/components/werkstatt/WerkstattAnfragen'

export const dynamic = 'force-dynamic'

export default async function WerkstattAnfragenPage() {
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const leads = await getWerkstattLeads()

  return <WerkstattAnfragen leads={leads} werkstattName={werkstatt.name} />
}
