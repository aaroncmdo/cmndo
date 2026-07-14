import { createServiceClient } from '@/lib/supabase/server'
import { SectionCard } from '@/components/shared/SectionCard'
import PageHeader from '@/components/shared/PageHeader'
import { getWinbackCandidates } from '@/lib/leads/winback'
import { WinbackClient } from './WinbackClient'

// Admin-Trigger für die Win-back-Reaktivierungs-Kampagne. Zugriff über das
// Admin-Layout gegated; die Server-Action prüft zusätzlich requireAdmin.

export const dynamic = 'force-dynamic'

export default async function LeadReaktivierungPage() {
  const db = createServiceClient()
  const count = (await getWinbackCandidates(db, 500)).length

  return (
    <div className="space-y-6 py-6">
      <PageHeader
        title="Lead-Reaktivierung"
        description="Einmalige Reaktivierungs-Mail an erreichbare, kalt gewordene Leads, die eine Schadenmeldung begonnen, aber nie abgeschlossen haben."
        size="lg"
      />

      <SectionCard>
        <div className="flex items-baseline gap-3">
          <span className="text-heading-lg font-bold text-claimondo-navy">{count}</span>
          <span className="text-body-sm text-claimondo-ondo">reaktivierbare Leads</span>
        </div>
        <p className="mt-2 text-body-xs text-claimondo-slate">
          Kohorte: Status „kalt" oder wegen Zeitüberschreitung disqualifiziert, mit E-Mail + Resume-Token,
          noch nicht angeschrieben und nicht abgemeldet. Inhaltlich disqualifizierte Leads (z.B.
          Eigenverschulden) sind bewusst ausgeschlossen. Jede Mail enthält einen Abmelde-Link
          (List-Unsubscribe).
        </p>
        <div className="mt-4">
          <WinbackClient eligibleCount={count} />
        </div>
      </SectionCard>
    </div>
  )
}
