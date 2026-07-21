import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getFlotteTermine } from '@/lib/flotte/flotte-termine'
import FlotteTermineClient from './FlotteTermineClient'

export const dynamic = 'force-dynamic'

export default async function FlotteTerminePage() {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  const { termine, fallMap, vehicleByClaim } = firma
    ? await getFlotteTermine(db, firma.id)
    : { termine: [], fallMap: {}, vehicleByClaim: {} }
  return <FlotteTermineClient termine={termine} fallMap={fallMap} vehicleByClaim={vehicleByClaim} />
}
