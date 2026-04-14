// AAR-68 + AAR-102: Mitarbeiter Nachrichten - gefiltert auf KB-Faelle, Multi-Channel Inbox
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NachrichtenInboxClient from '@/app/admin/nachrichten/NachrichtenInboxClient'

export const dynamic = 'force-dynamic'

const VISIBLE_KANAELE = ['whatsapp', 'chat_kb_kunde', 'gruppenchat', 'chat_kunde_sv']

export default async function MitarbeiterNachrichten() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, kennzeichen, lead_id')
    .eq('kundenbetreuer_id', user.id)

  const fallIds = (faelle ?? []).map(f => f.id)
  const fallMap = new Map((faelle ?? []).map(f => [f.id, f]))

  const { data: nachrichten } = fallIds.length > 0 ? await supabase
    .from('nachrichten')
    .select('id, fall_id, kanal, sender_id, nachricht, gelesen, created_at')
    .in('fall_id', fallIds)
    .in('kanal', VISIBLE_KANAELE)
    .order('created_at', { ascending: false })
    .limit(500)
  : { data: [] }

  const leadIds = (faelle ?? []).map(f => f.lead_id).filter(Boolean) as string[]
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

  type Thread = {
    fallId: string
    fallNummer: string | null
    kennzeichen: string | null
    kundeName: string
    lastMessage: string
    lastAt: string
    lastKanal: string
    unreadCount: number
  }
  const threadMap = new Map<string, Thread>()
  for (const n of nachrichten ?? []) {
    if (!n.fall_id) continue
    const info = fallMap.get(n.fall_id)
    if (!threadMap.has(n.fall_id)) {
      threadMap.set(n.fall_id, {
        fallId: n.fall_id,
        fallNummer: info?.fall_nummer ?? null,
        kennzeichen: info?.kennzeichen ?? null,
        kundeName: info?.lead_id ? (kundenMap[info.lead_id] ?? 'Kunde') : 'Unbekannt',
        lastMessage: (n.nachricht ?? '').slice(0, 80),
        lastAt: n.created_at,
        lastKanal: n.kanal,
        unreadCount: 0,
      })
    }
    if (!n.gelesen && n.sender_id !== user.id) threadMap.get(n.fall_id)!.unreadCount++
  }
  const threads = Array.from(threadMap.values()).sort((a, b) => (b.lastAt > a.lastAt ? 1 : -1))

  return <NachrichtenInboxClient threads={threads} currentUserId={user.id} />
}
