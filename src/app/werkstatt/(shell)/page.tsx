// AAR-956 WP-B (Task 9): Werkstatt-Uebersicht-Dashboard.
// Zeigt vermittelte Claims + offene/freigegebene/ausgezahlte Provisions-Summen.

import { redirect } from 'next/navigation'
import { getWerkstattByUserId, getWerkstattOverview, getWerkstattVermittlungsCount, getWerkstattStaffelStufen } from '@/lib/werkstatt/queries'
import { getWerkstattLeads } from '@/lib/werkstatt/leads-queries'
import {
  FolderCheckIcon,
  ClockIcon,
  CheckCircle2Icon,
  WalletIcon,
  InboxIcon,
} from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { WerkstattStaffelCard } from '@/components/werkstatt/WerkstattStaffelCard'

export const dynamic = 'force-dynamic'

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export default async function WerkstattUebersichtPage() {
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const [overview, vermittlung, stufen, offeneLeads] = await Promise.all([
    getWerkstattOverview(werkstatt.id),
    getWerkstattVermittlungsCount(werkstatt.id),
    getWerkstattStaffelStufen(werkstatt.id),
    getWerkstattLeads(),
  ])
  const offeneAnfragen = offeneLeads.length

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-heading-md text-claimondo-navy font-bold">
          Übersicht
        </h1>
        <p className="text-body text-claimondo-ondo mt-0.5">
          Willkommen, {werkstatt.name}. Hier sehen Sie Ihre Vermittlungs- und
          Provisions-Kennzahlen auf einen Blick.
        </p>
      </header>

      {offeneAnfragen > 0 && (
        <StatCard
          label="Offene Anfragen"
          value={offeneAnfragen}
          icon={InboxIcon}
          tone="navy"
          filled
          href="/werkstatt/anfragen"
          hint="Kundendaten prüfen & vervollständigen →"
        />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Vermittelte Schäden"
          value={overview.vermittelteClaimsTotal}
          icon={FolderCheckIcon}
          tone="navy"
        />
        <StatCard
          label="Ausstehend"
          value={EUR.format(overview.provisionen.offeneSumme)}
          icon={ClockIcon}
          tone="warning"
          hint="fällig nach Clawback-Frist"
        />
        <StatCard
          label="Freigegeben"
          value={EUR.format(overview.provisionen.freigegebeneSumme)}
          icon={CheckCircle2Icon}
          tone="success"
          hint="zur Auszahlung freigegeben"
        />
        <StatCard
          label="Ausgezahlt"
          value={EUR.format(overview.provisionen.ausgezahlteSumme)}
          icon={WalletIcon}
          tone="ondo"
          hint="bisherige Gesamtauszahlungen"
        />
      </div>

      <WerkstattStaffelCard
        settledCount={vermittlung.settled}
        pendingCount={vermittlung.pending}
        stufen={stufen}
      />

      <section className="bg-white rounded-ios-md border border-claimondo-border p-5">
        <h2 className="text-heading-sm text-claimondo-navy font-semibold mb-3">
          So funktioniert die Vermittlung
        </h2>
        <ol className="space-y-2 text-body-sm text-claimondo-navy list-decimal list-inside">
          <li>
            Hängen Sie den QR-Code in Ihrem Betrieb aus (Seite{' '}
            <a href="/werkstatt/promo" className="text-claimondo-ondo underline underline-offset-2">
              QR-Code
            </a>
            ).
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
  )
}
