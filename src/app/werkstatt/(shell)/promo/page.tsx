// AAR-956 WP-B (Task 9): QR-Code-Seite fuer Werkstaetten.
// Generiert den Einstiegs-QR (werkstattStartUrl) server-seitig als SVG,
// uebergibt an WerkstattPromo zum Herunterladen + Aushaengen.

import { redirect } from 'next/navigation'
import { getWerkstattByUserId } from '@/lib/werkstatt/queries'
import { werkstattStartUrl } from '@/lib/start-link/werkstatt-start-url'
import { generateQrCodeSvg } from '@/lib/kanzlei/qr-code'
import { WerkstattPromo } from '@/components/werkstatt/WerkstattPromo'

export const dynamic = 'force-dynamic'

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export default async function WerkstattPromoPage() {
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const startUrl = werkstattStartUrl(werkstatt.id)
  const qrSvg = await generateQrCodeSvg(startUrl, 300)

  return (
    <>
      <WerkstattPromo
        startUrl={startUrl}
        qrSvg={qrSvg}
        werkstattName={werkstatt.name}
      />

      <div className="px-4 md:px-6 pb-6 max-w-3xl mx-auto">
        <section className="bg-white rounded-ios-md border border-claimondo-border p-5">
          <h2 className="text-heading-sm text-claimondo-navy font-semibold mb-3">
            So funktioniert die Vermittlung
          </h2>
          <ol className="space-y-2 text-body-sm text-claimondo-navy list-decimal list-inside">
            <li>
              Hängen Sie den unten stehenden QR-Code in Ihrem Betrieb aus.
            </li>
            <li>
              Kunden scannen den Code und melden ihren Schaden digital über Claimondo.
            </li>
            <li>
              Sobald ein Schadensfall eröffnet wird, entsteht eine Provision von{' '}
              {EUR.format(werkstatt.provision_betrag_netto)} netto.
            </li>
            <li>
              Nach der 7-tägigen Widerrufs-Frist wird die Provision{' '}
              <strong>freigegeben</strong> und zum Monatsende ausgezahlt.
            </li>
          </ol>
        </section>
      </div>
    </>
  )
}
