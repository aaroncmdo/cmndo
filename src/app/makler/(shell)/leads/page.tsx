// AAR-485 (M3): Makler-Leads-Liste — Server-Entry. Lädt Leads + Consent-Status
// via getMaklerLeadsWithConsent und rendert sie in der Client-Tabelle.

import { UserCheckIcon } from 'lucide-react'
import { getCurrentMakler, getMaklerLeadsWithConsent } from '@/lib/makler/queries'
import { MaklerLeadsTable } from '@/components/makler/MaklerLeadsTable'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default async function MaklerLeadsPage() {
  const makler = await getCurrentMakler()
  if (!makler) return null

  const leads = await getMaklerLeadsWithConsent(makler.id)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <PageHeader
        title="Leads"
        description="Ihre Leads mit Consent-Status und Schnellzugriff auf die Akte"
        icon={UserCheckIcon}
      />

      <MaklerLeadsTable leads={leads} />
    </div>
  )
}
