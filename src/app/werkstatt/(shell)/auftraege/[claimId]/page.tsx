// Werkstatt-Auftrag — Detailseite (D). Echte Server-Component (KEIN redirect-Stub,
// s. RSC-redirect-Antipattern). Zugriff via v_werkstatt_auftrag (RLS is_werkstatt_for_claim):
// ein Fremd-Auftrag liefert null -> notFound() (kein IDOR).

import { redirect, notFound } from 'next/navigation'
import { getWerkstattByUserId, getWerkstattAuftrag } from '@/lib/werkstatt/queries'
import { WerkstattAuftragDetail } from '@/components/werkstatt/WerkstattAuftragDetail'

export const dynamic = 'force-dynamic'

export default async function WerkstattAuftragDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>
}) {
  const { claimId } = await params

  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const auftrag = await getWerkstattAuftrag(claimId)
  if (!auftrag) notFound()

  return <WerkstattAuftragDetail auftrag={auftrag} />
}
