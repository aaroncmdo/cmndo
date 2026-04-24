// AAR-102: Multi-Channel Inbox mit Split-View + MultiChannelChat
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { roleToPath } from '@/lib/auth/role-redirect'
import NachrichtenInboxClient from './NachrichtenInboxClient'

export const dynamic = 'force-dynamic'

const VISIBLE_KANAELE = ['whatsapp', 'chat_kb_kunde', 'gruppenchat', 'chat_kunde_sv']

export default async function NachrichtenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  // AAR-719: Defensiv — bei falscher Rolle ins eigene Portal statt /admin.
  if (!profile || !['admin', 'kundenbetreuer', 'dispatch'].includes(profile.rolle)) {
    redirect(profile?.rolle ? roleToPath(profile.rolle as string) : '/login')
  }

  // Fetch letzte 500 Nachrichten in sichtbaren Kanaelen
  const { data: nachrichten } = await supabase
    .from('nachrichten')
    .select('id, fall_id, kanal, sender_id, sender_rolle, nachricht, gelesen, created_at')
    .in('kanal', VISIBLE_KANAELE)
    .not('fall_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  const fallIds = Array.from(new Set((nachrichten ?? []).map(n => n.fall_id).filter(Boolean) as string[]))
  const fallMap: Record<string, { fall_nummer: string | null; lead_id: string | null; kennzeichen: string | null }> = {}

  if (fallIds.length > 0) {
    const { data: faelle } = await supabase
      .from('faelle')
      .select('id, fall_nummer, lead_id, kennzeichen')
      .in('id', fallIds)
    for (const f of faelle ?? []) {
      fallMap[f.id] = { fall_nummer: f.fall_nummer, lead_id: f.lead_id, kennzeichen: f.kennzeichen }
    }
  }

  const leadIds = Array.from(new Set(Object.values(fallMap).map(f => f.lead_id).filter(Boolean) as string[]))
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

  // Gruppieren nach fall_id - nimmt jeweils letzte Message + unread count
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
    const info = fallMap[n.fall_id]
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
    const t = threadMap.get(n.fall_id)!
    // Unread counter (nicht vom eigenen User)
    if (!n.gelesen && n.sender_id !== user.id) t.unreadCount++
  }

  const threads = Array.from(threadMap.values()).sort((a, b) => (b.lastAt > a.lastAt ? 1 : -1))

  return <NachrichtenInboxClient threads={threads} currentUserId={user.id} />
}
