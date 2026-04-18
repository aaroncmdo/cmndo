// AAR-485 (M3): Makler-Leads-Liste — Server-Entry. Lädt Leads + Consent-Status
// via getMaklerLeadsWithConsent und rendert sie in der Client-Tabelle.

import { getCurrentMakler, getMaklerLeadsWithConsent } from '@/lib/makler/queries'
import { MaklerLeadsTable } from '@/components/makler/MaklerLeadsTable'

export const dynamic = 'force-dynamic'

export default async function MaklerLeadsPage() {
  const makler = await getCurrentMakler()
  if (!makler) return null

  const leads = await getMaklerLeadsWithConsent(makler.id)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[#0D1B3E]">Leads</h1>
        <p className="text-sm text-[#4573A2] mt-1">
          Ihre Leads mit Consent-Status und Schnellzugriff auf die Akte
        </p>
      </header>

      <MaklerLeadsTable leads={leads} />
    </div>
  )
}
