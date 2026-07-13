import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getFlottenClaimDetail } from '@/lib/flotte/flotten-claim-detail'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import EmptyState from '@/components/shared/EmptyState'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function FlottenClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string; claimId: string }>
}) {
  const { id, claimId } = await params

  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)

  const claim = firma ? await getFlottenClaimDetail(db, firma.id, id, claimId) : null

  if (!claim) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
        <EmptyState
          title="Schaden nicht gefunden"
          description="Dieser Schaden gehört nicht zu einem Fahrzeug Ihrer Flotte."
        />
      </div>
    )
  }

  const fahrzeugLabel =
    [claim.kennzeichen, claim.hersteller, claim.modell].filter(Boolean).join(' · ') || 'Fahrzeug'

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">{claim.claimNummer ?? 'Schaden'}</h1>
        <p className="mt-1 text-sm text-claimondo-shield">Schaden-Details · {fahrzeugLabel}</p>
      </div>

      <SectionCard title="Schaden">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-claimondo-ondo">Status</dt>
            <dd>
              <StatusBadge domain="claims-status" code={claim.status} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-claimondo-ondo">Schadentag</dt>
            <dd className="text-claimondo-navy">{formatDatum(claim.schadentag)}</dd>
          </div>
          {claim.schadensHoeheNetto != null ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-claimondo-ondo">Schadenshöhe (netto)</dt>
              <dd className="text-claimondo-navy">
                {claim.schadensHoeheNetto.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </dd>
            </div>
          ) : null}
        </dl>
      </SectionCard>

      <SectionCard title="Fahrzeug">
        <p className="text-sm text-claimondo-navy">{fahrzeugLabel}</p>
      </SectionCard>
    </div>
  )
}
