import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getFlottenClaimView } from '@/lib/flotte/flotten-claim-detail'
import EmptyState from '@/components/shared/EmptyState'
import { FlottenClaimDetailView } from '@/components/flotte/FlottenClaimDetailView'
import { ladeFlottenSchadenDokumentHoch } from './actions'
import { getLetzterScanFuerVehicle } from '@/lib/vehicles/vehicle-scan-view'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

export default async function FlottenClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string; claimId: string }>
}) {
  const { id, claimId } = await params

  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)

  const view = firma ? await getFlottenClaimView(db, firma.id, id, claimId) : null

  if (!view) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8">
        <EmptyState
          title="Schaden nicht gefunden"
          description="Dieser Schaden gehört nicht zu einem Fahrzeug Ihrer Flotte."
        />
      </div>
    )
  }

  // Zustandsdoku-Vorzustand (Kandidat 3): letzter abgeschlossener Fahrzeug-Scan fuers Cockpit
  // (Foto + Qualitaets-Ampel + Vorschaeden). db = Admin nach den getFlottenClaimView-Gates.
  const scan = await getLetzterScanFuerVehicle(db, id)

  return (
    <FlottenClaimDetailView
      view={view}
      vehicleId={id}
      scan={scan}
      onUpload={ladeFlottenSchadenDokumentHoch}
    />
  )
}
