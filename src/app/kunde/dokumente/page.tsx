import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function KundeDokumentePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Find the user's case
  const { data: fall } = await supabase
    .from('faelle')
    .select('id')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fall) {
    redirect(`/kunde/fall/${fall.id}#dateien`)
  }

  // Fallback: find via lead
  const { data: leads } = await supabase.from('leads').select('id').eq('email', user.email!)
  if (leads?.length) {
    const { data: fallByLead } = await supabase
      .from('faelle')
      .select('id')
      .in('lead_id', leads.map(l => l.id))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fallByLead) redirect(`/kunde/fall/${fallByLead.id}#dateien`)
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-4" style={{ letterSpacing: '-0.03em' }}>Dokumente</h1>
      <div className="rounded-3xl p-8 text-center" style={{ background: '#ffffff', border: '1px solid #e5e7eb' }}>
        <p style={{ color: '#6b7280' }} className="text-sm">Noch keine Dokumente vorhanden.</p>
      </div>
    </div>
  )
}
