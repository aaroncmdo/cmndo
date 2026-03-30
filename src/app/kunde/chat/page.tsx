import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function KundeChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
    redirect(`/kunde/fall/${fall.id}#nachrichten`)
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
    if (fallByLead) redirect(`/kunde/fall/${fallByLead.id}#nachrichten`)
  }

  return (
    <div className="px-5 py-8">
      <h1 className="text-xl font-bold text-white mb-4" style={{ letterSpacing: '-0.03em' }}>Chat</h1>
      <div className="rounded-3xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)' }} className="text-sm">Noch keine Nachrichten vorhanden.</p>
      </div>
    </div>
  )
}
