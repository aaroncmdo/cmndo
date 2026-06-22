// AAR-956 WP-B (Task 9): QR-Code-Seite fuer Werkstaetten.
// Generiert den Einstiegs-QR (werkstattStartUrl) server-seitig als SVG,
// uebergibt an WerkstattPromo zum Herunterladen + Aushaengen.

import { redirect } from 'next/navigation'
import { getWerkstattByUserId } from '@/lib/werkstatt/queries'
import { werkstattStartUrl } from '@/lib/start-link/werkstatt-start-url'
import { generateQrCodeSvg } from '@/lib/kanzlei/qr-code'
import { WerkstattPromo } from '@/components/werkstatt/WerkstattPromo'

export const dynamic = 'force-dynamic'

export default async function WerkstattPromoPage() {
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const startUrl = werkstattStartUrl(werkstatt.id)
  const qrSvg = await generateQrCodeSvg(startUrl, 300)

  return (
    <WerkstattPromo
      startUrl={startUrl}
      qrSvg={qrSvg}
      werkstattName={werkstatt.name}
    />
  )
}
