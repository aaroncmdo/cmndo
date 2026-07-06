// AAR-956 WP-B (Task 9): Provisions-Seite fuer Werkstatt.
// Zeigt werkstatt_provisionen gefiltert nach werkstatt_id (RLS + expliziter Filter).
// Leak-safe: keine PII — nur betrag, status, dates, claim_nummer.

import { redirect } from 'next/navigation'
import { getWerkstattByUserId, getWerkstattProvisionen, getWerkstattStaffelBoni } from '@/lib/werkstatt/queries'
import { WerkstattAbrechnungen } from '@/components/werkstatt/WerkstattAbrechnungen'
import { getEigeneGutschriften } from '@/lib/finance/eigene-gutschriften-actions'

export const dynamic = 'force-dynamic'

export default async function WerkstattAbrechnungenPage() {
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const [provisionen, boni, gutschriften] = await Promise.all([
    getWerkstattProvisionen(werkstatt.id),
    getWerkstattStaffelBoni(werkstatt.id),
    getEigeneGutschriften(),
  ])
  const boniSumme = boni
    .filter((b) => b.status === 'freigegeben' || b.status === 'ausgezahlt')
    .reduce((s, b) => s + b.bonus_betrag_netto, 0)

  return (
    <WerkstattAbrechnungen
      provisionen={provisionen}
      werkstattName={werkstatt.name}
      boniSumme={boniSumme}
      gutschriften={gutschriften}
    />
  )
}
