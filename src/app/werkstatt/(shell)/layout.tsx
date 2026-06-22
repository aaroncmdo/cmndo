// AAR-956 WP-B (Task 9): Werkstatt-Portal-Layout. Auth-Guard + Rollen-Check
// + Werkstatt-Row-Bootstrap + Status-Weiche. Gespiegelt nach makler/(shell)/layout.tsx.
//
// Hinweis: user_id + status kommen aus der Migrations-Erweiterung (WP-A Task 2).
// database.types.ts wurde noch nicht regeneriert -> type-cast via getWerkstattByUserId
// in @/lib/werkstatt/queries (haelt die DB-Supabase-Typen-Luecke ab).

import { redirect } from 'next/navigation'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getWerkstattByUserId } from '@/lib/werkstatt/queries'
import { WerkstattShell } from '@/components/werkstatt/WerkstattShell'

export const dynamic = 'force-dynamic'

export default async function WerkstattLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = await requirePortalAccess(['werkstatt'])

  const werkstatt = await getWerkstattByUserId()

  if (!werkstatt) redirect('/werkstatt/pending')
  if (werkstatt.status !== 'aktiv') redirect('/werkstatt/pending')

  return (
    <WerkstattShell werkstatt={werkstatt} email={user.email ?? ''} userId={user.id}>
      {children}
    </WerkstattShell>
  )
}
