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
import { NetzwerkWidget } from '@/components/shared/netzwerk/NetzwerkWidget'
import { PartnerRangSelfCard } from '@/components/shared/PartnerRangSelfCard'
import { getPartnerRangSelf } from '@/lib/partner-rang/get'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export default async function WerkstattUebersichtPage() {
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const [overview, vermittlung, stufen, offeneLeads, partnerRang] = await Promise.all([
    getWerkstattOverview(werkstatt.id),
    getWerkstattVermittlungsCount(werkstatt.id),
    getWerkstattStaffelStufen(werkstatt.id),
    getWerkstattLeads(),
    getPartnerRangSelf(createAdminClient(), 'werkstatt', werkstatt.id),
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

      {partnerRang && <PartnerRangSelfCard rang={partnerRang} />}

      <WerkstattStaffelCard
        settledCount={vermittlung.settled}
        pendingCount={vermittlung.pending}
        stufen={stufen}
      />

      <NetzwerkWidget portal="werkstatt" />
    </div>
  )
}
