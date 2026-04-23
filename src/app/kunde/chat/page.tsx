import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ChatWithFallSidebar, { type FallThread } from '@/components/chat/ChatWithFallSidebar'

// AAR-730: Kunde-Chat auf MultiChannelChat-Basis migriert.
// Sichtbare Kanäle für Kunde: direkter Chat mit KB, direkter Chat mit SV,
// Gruppen-Chat (alle drei). WhatsApp bewusst NICHT im Kunde-UI — Kunde
// nutzt WhatsApp außerhalb der App, eingehende Nachrichten sind im Chat
// sichtbar via chat_kb_kunde-Alias.

export const dynamic = 'force-dynamic'

const KUNDE_KANAELE = ['chat_kb_kunde', 'chat_kunde_sv', 'gruppenchat'] as const

type Search = { fall?: string }

export default async function KundeChatPage({
  searchParams,
}: {
  searchParams?: Promise<Search>
}) {
  const params = (await searchParams) ?? {}
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // AAR-730: alle Fälle des Kunden laden (nicht nur einen wie vorher).
  // Ownership via kunde_id oder lead.email.
  const admin = createAdminClient()
  let faelle: Array<{ id: string; fall_nummer: string | null; lead_id: string | null }> = []

  const { data: direktFaelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, lead_id')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })
  if (direktFaelle && direktFaelle.length > 0) {
    faelle = direktFaelle as typeof faelle
  } else {
    const { data: leads } = await admin.from('leads').select('id').eq('email', user.email ?? '')
    const leadIds = (leads ?? []).map(l => l.id as string)
    if (leadIds.length > 0) {
      const { data: fallByLead } = await admin
        .from('faelle')
        .select('id, fall_nummer, lead_id')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
      faelle = (fallByLead ?? []) as typeof faelle
    }
  }

  if (faelle.length === 0) {
    return (
      <div className="px-5 py-8 max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-bold text-[#0D1B3E] mb-4">Chat</h1>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-gray-500 text-sm">
            Noch kein Schadensfall vorhanden. Sobald Ihr Fall erstellt wurde, können Sie hier
            mit Ihrem Kundenbetreuer und dem Gutachter chatten.
          </p>
        </div>
      </div>
    )
  }

  const fallIds = faelle.map(f => f.id)

  // Nachrichten pro Fall aggregieren.
  const { data: nachrichten } = await admin
    .from('nachrichten')
    .select('id, fall_id, kanal, sender_id, nachricht, gelesen, created_at')
    .in('fall_id', fallIds)
    .in('kanal', KUNDE_KANAELE as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(500)

  const threadMap = new Map<string, FallThread>()
  for (const fall of faelle) {
    threadMap.set(fall.id, {
      fallId: fall.id,
      fallNummer: fall.fall_nummer,
      kundeName: 'Mein Fall',
      lastMessage: '',
      lastAt: '',
      unreadCount: 0,
    })
  }
  for (const n of nachrichten ?? []) {
    if (!n.fall_id) continue
    const t = threadMap.get(n.fall_id)
    if (!t) continue
    if (!t.lastAt || n.created_at > t.lastAt) {
      t.lastAt = n.created_at
      t.lastMessage = (n.nachricht ?? '').slice(0, 80)
    }
    if (!n.gelesen && n.sender_id !== user.id) t.unreadCount++
  }
  const threads = Array.from(threadMap.values()).sort((a, b) =>
    b.lastAt > a.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0,
  )

  return (
    <ChatWithFallSidebar
      threads={threads}
      currentUserId={user.id}
      visibleKanaele={[...KUNDE_KANAELE]}
      initialFallId={params.fall ?? null}
      emptyHint="Noch keine Nachrichten. Sobald dein Kundenbetreuer oder Gutachter etwas schreibt, landet es hier."
    />
  )
}
