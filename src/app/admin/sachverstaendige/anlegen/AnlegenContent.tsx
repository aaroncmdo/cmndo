import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AnlegenTabs from './AnlegenTabs'
import PageHeader from '@/components/shared/PageHeader'

// ARCH-1 Phase 2 (BLOCK C): Admin-Page zum Anlegen von SVs/Büros/Akademien.
// AAR-235: Sub-SV-Tab entfernt — Sub-SVs werden direkt aus der Organisation-
// Detailseite hinzugefügt, nicht im Onboarding-Flow.

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

  return (
    <div className="h-full overflow-y-auto py-8">
      <div>
        <div className="mb-6">
          <PageHeader
            title="Sachverständigen anlegen"
            description="Lege einen neuen Solo-SV, ein komplettes Büro oder eine Akademie an."
          />
        </div>

        <AnlegenTabs />
      </div>
    </div>
  )
}
