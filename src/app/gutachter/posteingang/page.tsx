import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import PosteingangTabs from './PosteingangTabs'

// AAR-370: Posteingang — konsolidiert frühere /mitteilungen (System-Notifications)
// + /nachrichten (Fall-Chats) in einer Seite mit 2 Tabs + aggregiertem Badge.
// Alte URLs redirecten auf diese Route mit passendem ?tab=-Parameter.

export const dynamic = 'force-dynamic'

type Search = { tab?: string }

export default async function PosteingangPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const { tab } = await searchParams
  const initialTab: 'mitteilungen' | 'nachrichten' =
    tab === 'nachrichten' ? 'nachrichten' : 'mitteilungen'

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) redirect('/gutachter')

  // System-Mitteilungen
  const { data: mitteilungenRaw } = await supabase
    .from('gutachter_mitteilungen')
    .select('id, typ, titel, nachricht, gelesen, dringend, link, created_at')
    .eq('sv_id', sv.id)
    .order('created_at', { ascending: false })
    .limit(100)
  const mitteilungen = mitteilungenRaw ?? []

  // Fall-Chat-Threads (identische Logik wie /gutachter/nachrichten)
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, lead_id, status')
    .eq('sv_id', sv.id)
    .not('status', 'in', '("storniert")')
    .order('created_at', { ascending: false })

  const fallIds = (faelle ?? []).map(f => f.id)
  let threads: Array<{
    fallId: string
    fallNummer: string | null
    kundeName: string
    lastMessage: string
    lastAt: string
    unreadCount: number
    messages: Array<{
      id: string
      fall_id: string | null
      kanal: string
      sender_id: string | null
      sender_rolle: string | null
      nachricht: string | null
      hat_anhang: boolean
      created_at: string
      richtung: string | null
    }>
  }> = []

  if (fallIds.length > 0) {
    const { data: nachrichten } = await supabase
      .from('nachrichten')
      .select('id, fall_id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, created_at, richtung')
      .in('fall_id', fallIds)
      .order('created_at', { ascending: false })
      .limit(300)

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

    const threadMap = new Map<string, (typeof threads)[number]>()
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
          messages: [],
        })
      }
      const thread = threadMap.get(n.fall_id)!
      thread.messages.push({
        id: n.id,
        fall_id: n.fall_id,
        kanal: n.kanal,
        sender_id: n.sender_id,
        sender_rolle: n.sender_rolle,
        nachricht: n.nachricht,
        hat_anhang: n.hat_anhang,
        created_at: n.created_at,
        richtung: n.richtung,
      })
      if (n.richtung === 'inbound' || n.sender_rolle === 'kunde') {
        thread.unreadCount++
      }
    }
    threads = Array.from(threadMap.values()).sort((a, b) => (b.lastAt > a.lastAt ? 1 : -1))
  }

  const ungeleseneMitteilungen = mitteilungen.filter(m => !m.gelesen).length
  const ungeleseneChats = threads.reduce((acc, t) => acc + t.unreadCount, 0)

  return (
    <PosteingangTabs
      initialTab={initialTab}
      mitteilungen={mitteilungen}
      threads={threads}
      ungeleseneMitteilungen={ungeleseneMitteilungen}
      ungeleseneChats={ungeleseneChats}
    />
  )
}
