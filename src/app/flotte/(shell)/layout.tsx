import { redirect } from 'next/navigation'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerKontoWithFirma } from '@/lib/flotte/konto-firma'
import { FlotteManagerShell } from '@/components/flotte/FlotteManagerShell'

export const dynamic = 'force-dynamic'

export default async function FlotteLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const konto = await getFlottenmanagerKontoWithFirma(db, user.id)
  if (!konto) redirect('/login?error=Kein+Flotten-Konto')
  if (konto.status !== 'aktiv') redirect('/login?error=Konto+nicht+aktiv')
  return (
    <FlotteManagerShell firma={{ name: konto.firmaName }} email={user.email ?? ''} userId={user.id}>
      {children}
    </FlotteManagerShell>
  )
}
