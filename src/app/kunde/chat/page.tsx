import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ChatClient from './ChatClient'

export default async function KundeChatPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Fall finden: erst via kunde_id, dann via lead email
  let fallId: string | null = null

  const { data: directFall } = await supabase
    .from('faelle')
    .select('id')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (directFall) {
    fallId = directFall.id
  } else {
    const { data: leads } = await admin.from('leads').select('id').eq('email', user.email!)
    const leadIds = (leads ?? []).map(l => l.id)
    if (leadIds.length) {
      const { data: fallByLead } = await admin
        .from('faelle')
        .select('id')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      fallId = fallByLead?.id ?? null
    }
  }

  if (!fallId) {
    return (
      <div className="px-5 py-8 max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-bold text-[#0D1B3E] mb-4">Chat</h1>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-gray-500 text-sm">Noch kein Schadensfall vorhanden. Sobald Ihr Fall erstellt wurde, können Sie hier chatten.</p>
        </div>
      </div>
    )
  }

  // Nachrichten laden (admin client bypassed RLS - ownership already verified above)
  const { data: nachrichten } = await admin
    .from('nachrichten')
    .select('id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, created_at')
    .eq('fall_id', fallId)
    .in('kanal', ['portal-kunde-claimondo', 'portal-kunde-gutachter'])
    .order('created_at', { ascending: true })

  return <ChatClient fallId={fallId} nachrichten={nachrichten ?? []} userId={user.id} />
}
