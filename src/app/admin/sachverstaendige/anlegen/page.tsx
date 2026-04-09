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
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Sachverstaendigen anlegen</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Lege einen neuen Solo-SV an, ein komplettes Buero mit Sub-Standorten oder fuege einen Sub-SV zu einer bestehenden Org hinzu.
          </p>
          <p className="text-amber-700 text-xs mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 inline-block">
            ARCH-1: Self-Service-Onboarding ist abgeschaltet. SVs werden hier vom Admin angelegt und sehen beim ersten Login nur Konditionen + Vertrag + Stripe.
          </p>
        </div>

        <AnlegenTabs organisationen={organisationen} />
      </div>
    </div>
  )
}
