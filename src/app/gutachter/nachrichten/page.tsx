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
    // AAR-247 / AAR-250: Korrekter Leer-State mit Header + Erklärung.
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-[#4573A2]/10 flex items-center justify-center">
            <span className="text-2xl">💬</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Noch keine Nachrichten</h1>
          <p className="text-sm text-gray-500">
            Sobald Kunden, Kollegen oder der Support dir schreiben, siehst du hier alle Nachrichten zu deinen Fällen.
          </p>
        </div>
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
