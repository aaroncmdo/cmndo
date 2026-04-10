import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import NachrichtenSvClient from './NachrichtenSvClient'

// KFZ-182: Gutachter Nachrichten-Inbox — nur eigene Fall-Chats.

export const dynamic = 'force-dynamic'

export default async function GutachterNachrichtenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) redirect('/gutachter')

  // Fälle dieses SVs
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, lead_id, status')
    .eq('sv_id', sv.id)
    .not('status', 'in', '("storniert")')
    .order('created_at', { ascending: false })

  const fallIds = (faelle ?? []).map(f => f.id)
  if (fallIds.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        Keine Fälle vorhanden.
      </div>
    )
  }

  // Nachrichten für diese Fälle
  const { data: nachrichten } = await supabase
    .from('nachrichten')
    .select('id, fall_id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, created_at, richtung')
    .in('fall_id', fallIds)
    .order('created_at', { ascending: false })
    .limit(300)

  // Kunden-Namen aus Leads
  const leadIds = Array.from(new Set((faelle ?? []).map(f => f.lead_id).filter(Boolean) as string[]))
  const kundenMap: Record<string, string> = {}
  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, vorname, nachname')
      .in('id', leadIds)
    for (const l of leads ?? []) {
      kundenMap[l.id] = [l.vorname, l.nachname].filter(Boolean).join(' ') || 'Kunde'
    }
  }

  // Threads gruppieren
  type Thread = {
    fallId: string
    fallNummer: string | null
    kundeName: string
    lastMessage: string
    lastAt: string
    unreadCount: number
    messages: typeof nachrichten
  }

  const threadMap = new Map<string, Thread>()
  for (const n of nachrichten ?? []) {
    if (!n.fall_id) continue
    if (!threadMap.has(n.fall_id)) {
      const fall = faelle?.find(f => f.id === n.fall_id)
      const kundeName = fall?.lead_id ? (kundenMap[fall.lead_id] ?? 'Kunde') : 'Kunde'
      threadMap.set(n.fall_id, {
        fallId: n.fall_id,
        fallNummer: fall?.fall_nummer ?? null,
        kundeName,
        lastMessage: n.nachricht?.slice(0, 80) ?? '',
        lastAt: n.created_at,
        unreadCount: 0,
        messages: [],
      })
    }
    threadMap.get(n.fall_id)!.messages!.push(n)
    if (n.richtung === 'inbound' || n.sender_rolle === 'kunde') {
      threadMap.get(n.fall_id)!.unreadCount++
    }
  }

  const threads = Array.from(threadMap.values()).sort((a, b) => (b.lastAt > a.lastAt ? 1 : -1))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <NachrichtenSvClient threads={threads as any} />
}
