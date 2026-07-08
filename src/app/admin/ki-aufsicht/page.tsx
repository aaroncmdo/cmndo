import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { aggregiereSlaLage, ladeSlaRows } from '@/lib/aufsicht/sla-rollen'
import { KiAufsichtPanel } from './_components/KiAufsichtPanel'

export const dynamic = 'force-dynamic'

export default async function KiAufsichtPage() {
  // Admin-Guard (gleicher Aufbau wie admin/ai-vorschlaege/page.tsx)
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

  if (p?.rolle !== 'admin') redirect('/admin')

  // SLA-Lage aggregieren
  const rows = await ladeSlaRows()
  const lage = aggregiereSlaLage(rows, new Date())

  // Offene Aufsicht-Vorschlaege laden (DB-Row-IDs, quelle='aufsicht')
  const db = createAdminClient()
  const { data: vorschlaege } = await db
    .from('ai_claim_proposals')
    .select('id, claim_id, vorschlag_typ, ziel_rolle, payload, begruendung')
    .eq('quelle', 'aufsicht')
    .eq('status', 'offen')

  // Content-return (kein reiner redirect-Stub — Redirect-Stub-Gate erfuellt)
  return (
    <div className="max-w-4xl mx-auto px-5 pb-8 pt-6 space-y-6">
      <div>
        <h1 className="text-heading-lg text-claimondo-navy">KI-Aufsicht</h1>
        <p className="text-body-sm text-claimondo-ondo mt-1">
          SLA-Fristen-Lage pro Rolle · freigabepflichtige Remediations
        </p>
      </div>
      <KiAufsichtPanel lage={lage} vorschlaege={vorschlaege ?? []} />
    </div>
  )
}
