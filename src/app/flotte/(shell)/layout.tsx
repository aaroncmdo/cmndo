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
  // Kein Konto ODER deaktiviert -> in-app Sackgassen-Seite statt /login: der User
  // IST eingeloggt; /login zeigte ihm nur ein Anmeldeformular + eine interne
  // Fehlermeldung ohne Ausgang, und roleToPath('flottenmanager') = /flotte warf
  // ihn beim naechsten Login-Versuch sofort wieder raus.
  if (!konto || konto.status !== 'aktiv') redirect('/flotte/kein-zugang')
  return (
    <FlotteManagerShell firma={{ name: konto.firmaName }} email={user.email ?? ''} userId={user.id}>
      {children}
    </FlotteManagerShell>
  )
}
