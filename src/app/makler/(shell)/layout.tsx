// AAR-483 (M1): Makler-Portal-Layout. Auth-Guard + Rollen-Check + Makler-Row-
// Bootstrap + Status-Weiche. Bei fehlender Makler-Row wird auf /makler/onboarding
// umgeleitet (Edge-Case), bei status != 'aktiv' auf /makler/pending.

import { redirect } from 'next/navigation'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { MaklerShell } from '@/components/makler/MaklerShell'

export const dynamic = 'force-dynamic'

export default async function MaklerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // K5 / AAR-frontend-konsolidierung-p1: Auth + Rollen-Guard zentralisiert.
  const { supabase, user } = await requirePortalAccess(['makler'])

  const { data: makler } = await supabase
    .from('makler')
    .select('id, firma, ansprechpartner_vorname, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!makler) redirect('/makler/onboarding')
  if (makler.status !== 'aktiv') redirect('/makler/pending')

  return (
    <MaklerShell makler={makler} email={user.email ?? ''} userId={user.id}>
      {children}
    </MaklerShell>
  )
}
