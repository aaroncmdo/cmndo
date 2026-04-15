import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AnlegenTabs from './AnlegenTabs'
import { listBueroOrganisationen } from './actions'

// ARCH-1 Phase 2 (BLOCK C): Admin-Page zum Anlegen von SVs/Bueros/Sub-SVs.

export default async function SachverstaendigeAnlegen() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  // Bestehende Buero-Orgs fuer den Sub-SV-Tab laden
  const organisationen = await listBueroOrganisationen()

  return (
    <div className="h-full overflow-y-auto py-8">
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Sachverständigen anlegen</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Lege einen neuen Solo-SV an, ein komplettes Büro mit Sub-Standorten oder füge einen Sub-SV zu einer bestehenden Org hinzu.
          </p>
          {/* AAR-197: ARCH-1-Dev-Banner entfernt — war Intern-Hinweis, hat in
              Production-UI nichts zu suchen. */}
        </div>

        <AnlegenTabs organisationen={organisationen} />
      </div>
    </div>
  )
}
