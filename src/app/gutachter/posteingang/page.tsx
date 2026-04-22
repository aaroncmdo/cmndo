import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import ChatWithFallSidebar, { type FallThread } from '@/components/chat/ChatWithFallSidebar'

// AAR-722 + AAR-726: Gutachter-Posteingang ist jetzt reiner Chat-Bereich.
// System-Mitteilungen (AAR-370 Mitteilungen-Tab) leben ab jetzt in der
// Updates-Nav (AAR-725, in Arbeit). Der Posteingang zeigt nur noch
// Fall-Chats mit dem Kunden + Gruppen-Chat.
//
// Sichtbare Kanäle für SV: whatsapp, chat_kunde_sv, gruppenchat.
// Interne KB-Kommunikation (chat_kb_kunde, chat_kb_sv) bleibt unsichtbar —
// das ist Aufgabe des KB-Portals bzw. der geteilten Fallakte.

export const dynamic = 'force-dynamic'

type Search = { fall?: string }

export default async function PosteingangPage({
  searchParams,
}: {
  searchParams?: Promise<Search>
}) {
  const params = (await searchParams) ?? {}
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) redirect('/gutachter')

  // Fall-Chat-Threads
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, lead_id, status')
    .eq('sv_id', sv.id)
    .not('status', 'in', '("storniert")')
    .order('created_at', { ascending: false })

  const fallIds = (faelle ?? []).map(f => f.id)
  const threads: FallThread[] = []

  if (fallIds.length > 0) {
    // AAR-722: Kanal-Filter im Server-Query — SV sieht nur seine drei
    // sichtbaren Kanäle. KB-interne Kanäle werden gar nicht erst geladen.
    const svKanaele = ['whatsapp', 'chat_kunde_sv', 'gruppenchat']
    const { data: nachrichten } = await supabase
      .from('nachrichten')
      .select('id, fall_id, kanal, sender_id, sender_rolle, nachricht, created_at, richtung, gelesen')
      .in('fall_id', fallIds)
      .in('kanal', svKanaele)
      .order('created_at', { ascending: false })
      .limit(300)

    const leadIds = Array.from(
      new Set((faelle ?? []).map(f => f.lead_id).filter(Boolean) as string[]),
    )
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

    const threadMap = new Map<string, FallThread>()
    for (const n of nachrichten ?? []) {
      if (!n.fall_id) continue
      if (!threadMap.has(n.fall_id)) {
        const fall = faelle?.find(f => f.id === n.fall_id)
        const kundeName = fall?.lead_id ? (kundenMap[fall.lead_id] ?? 'Kunde') : 'Kunde'
        threadMap.set(n.fall_id, {
          fallId: n.fall_id,
          fallNummer: (fall?.fall_nummer as string | null) ?? null,
          kundeName,
          lastMessage: n.nachricht?.slice(0, 80) ?? '',
          lastAt: n.created_at,
          unreadCount: 0,
        })
      }
      const thread = threadMap.get(n.fall_id)!
      // Nur die erste (= neueste) Nachricht als lastMessage — Query ist DESC
      // sortiert, aber wir überschreiben hier nicht, weil erste Iteration
      // bereits die neueste ist.
      // Unread: von Kunde geschickt und nicht gelesen
      if (!n.gelesen && n.sender_id !== user.id) {
        thread.unreadCount++
      }
    }
    for (const t of threadMap.values()) threads.push(t)
    threads.sort((a, b) => (b.lastAt > a.lastAt ? 1 : -1))
  }

  return (
    <ChatWithFallSidebar
      threads={threads}
      currentUserId={user.id}
      visibleKanaele={['whatsapp', 'chat_kunde_sv', 'gruppenchat']}
      emptyHint="Noch keine Kunden-Nachrichten. Sobald ein Fall zugewiesen ist, kannst du hier mit dem Kunden kommunizieren."
      initialFallId={params.fall ?? null}
    />
  )
}
