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
    const [nachrichtenRes, leadsRes] = await Promise.all([
      supabase
        .from('nachrichten')
        .select('id, fall_id, kanal, sender_id, nachricht, created_at, gelesen')
        .in('fall_id', fallIds)
        .in('kanal', svKanaele)
        .order('created_at', { ascending: false })
        .limit(300),
      (async () => {
        const leadIds = Array.from(
          new Set((faelle ?? []).map(f => f.lead_id).filter(Boolean) as string[]),
        )
        if (leadIds.length === 0) return { data: [] as Array<{ id: string; vorname: string | null; nachname: string | null }> }
        return supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
      })(),
    ])
    const nachrichten = nachrichtenRes.data ?? []
    const kundenMap: Record<string, string> = {}
    for (const l of leadsRes.data ?? []) {
      kundenMap[l.id as string] = [l.vorname, l.nachname].filter(Boolean).join(' ') || 'Kunde'
    }

    // AAR-730-hotfix: Für JEDEN zugewiesenen Fall einen Thread vorbereiten
    // — auch wenn noch keine Nachricht drin ist. Sonst würde der SV einen
    // frisch zugewiesenen Fall nicht in der Sidebar sehen und könnte den
    // Kunden nicht proaktiv anschreiben.
    const threadMap = new Map<string, FallThread>()
    for (const fall of faelle ?? []) {
      const kundeName = fall.lead_id ? (kundenMap[fall.lead_id] ?? 'Kunde') : 'Kunde'
      threadMap.set(fall.id, {
        fallId: fall.id,
        fallNummer: (fall.fall_nummer as string | null) ?? null,
        kundeName,
        lastMessage: '',
        lastAt: '',
        unreadCount: 0,
      })
    }

    // Nachrichten-Stats an die bestehenden Threads attachen.
    for (const n of nachrichten) {
      if (!n.fall_id) continue
      const thread = threadMap.get(n.fall_id)
      if (!thread) continue
      if (!thread.lastAt || n.created_at > thread.lastAt) {
        thread.lastAt = n.created_at
        thread.lastMessage = n.nachricht?.slice(0, 80) ?? ''
      }
      if (!n.gelesen && n.sender_id !== user.id) {
        thread.unreadCount++
      }
    }

    // Threads mit Nachrichten zuerst (neueste oben), dann leere Threads.
    const sorted = Array.from(threadMap.values()).sort((a, b) => {
      if (a.lastAt && !b.lastAt) return -1
      if (!a.lastAt && b.lastAt) return 1
      return b.lastAt > a.lastAt ? 1 : -1
    })
    for (const t of sorted) threads.push(t)
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
