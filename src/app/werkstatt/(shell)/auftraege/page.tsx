// Werkstatt-Portal: „Aufträge" — vermittelte + inbound Aufträge mit Gutachter,
// Besichtigungstermin und Fahrzeug (self-scoped via v_werkstatt_auftrag).
// Schließt die Anzeige-Lücke (View war orphaned: 0 Frontend-Consumers).

import { redirect } from 'next/navigation'
import { getWerkstattByUserId, getWerkstattAuftraege } from '@/lib/werkstatt/queries'
import { WerkstattAuftraege } from '@/components/werkstatt/WerkstattAuftraege'

export const dynamic = 'force-dynamic'

export default async function WerkstattAuftraegePage() {
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const auftraege = await getWerkstattAuftraege()

  return <WerkstattAuftraege auftraege={auftraege} werkstattName={werkstatt.name} />
}
