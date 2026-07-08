import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listOpenProposals } from '@/lib/orchestrator/proposals'
import { getTypeStats } from '@/lib/orchestrator/stats'
import { SectionCard } from '@/components/shared/SectionCard'
import { GraduierungPanel } from '@/components/admin/GraduierungPanel'
import { AiVorschlaegeClient } from './AiVorschlaegeClient'

export const dynamic = 'force-dynamic'

export default async function AiVorschlaegePage() {
  // Admin-Guard (gleicher Aufbau wie admin/health/page.tsx)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (p?.rolle !== 'admin') redirect('/login')

  const [vorschlaege, typeStats] = await Promise.all([
    listOpenProposals(),
    getTypeStats(),
  ])

  return (
    <>
      <AiVorschlaegeClient vorschlaege={vorschlaege} />
      <div className="max-w-4xl mx-auto px-5 pb-8">
        <SectionCard
          title="Auto-Graduierung"
          subtitle="Vorschlagstypen mit ausreichender Annahme-Quote (≥ 80 % bei ≥ 30 Entscheidungen) können auf automatische Ausführung graduiert werden."
        >
          <GraduierungPanel stats={typeStats} />
        </SectionCard>
      </div>
    </>
  )
}
