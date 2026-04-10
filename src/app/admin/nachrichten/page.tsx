import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NachrichtenInboxClient from './NachrichtenInboxClient'

// KFZ-182 Phase C: Gesamt-Chat-Inbox für Admin/KB.

export const dynamic = 'force-dynamic'

export default async function NachrichtenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'kundenbetreuer'].includes(profile.rolle)) {
    redirect('/admin')
  }

  const isAdmin = profile.rolle === 'admin'

  // Fetch recent nachrichten grouped by fall (last 500 messages)
  let query = supabase
    .from('nachrichten')
    .select('id, fall_id, kanal, sender_id, sender_rolle, nachricht, hat_anhang, created_at, kb_empfaenger_id, richtung')
    .eq('kanal', 'whatsapp')
    .order('created_at', { ascending: false })
    .limit(500)

  if (!isAdmin) {
    query = query.eq('kb_empfaenger_id', user.id)
  }

  const { data: nachrichten } = await query

  // Get unique fall_ids and load fall info
  const fallIds = Array.from(new Set((nachrichten ?? []).map(n => n.fall_id).filter(Boolean) as string[]))
  let fallMap: Record<string, { fall_nummer: string | null; lead_id: string | null; kundenbetreuer_id: string | null }> = {}

  if (fallIds.length > 0) {
    const { data: faelle } = await supabase
      .from('faelle')
      .select('id, fall_nummer, lead_id, kundenbetreuer_id')
      .in('id', fallIds)
    for (const f of faelle ?? []) {
      fallMap[f.id] = { fall_nummer: f.fall_nummer, lead_id: f.lead_id, kundenbetreuer_id: f.kundenbetreuer_id }
    }
  }

  // Load customer names from leads
  const leadIds = Array.from(new Set(Object.values(fallMap).map(f => f.lead_id).filter(Boolean) as string[]))
  let kundenMap: Record<string, string> = {}
  if (leadIds.length > 0) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, vorname, nachname')
      .in('id', leadIds)
    for (const l of leads ?? []) {
      kundenMap[l.id] = [l.vorname, l.nachname].filter(Boolean).join(' ') || 'Kunde'
    }
  }

  // Build chat threads grouped by fall_id
  type Thread = {
    fallId: string | null
    fallNummer: string | null
    kundeName: string
    lastMessage: string
    lastAt: string
    unreadCount: number
    messages: typeof nachrichten
  }

  const threadMap = new Map<string, Thread>()
  for (const n of nachrichten ?? []) {
    const key = n.fall_id ?? 'unzugeordnet'
    if (!threadMap.has(key)) {
      const fallInfo = n.fall_id ? fallMap[n.fall_id] : null
      const kundeName = fallInfo?.lead_id ? (kundenMap[fallInfo.lead_id] ?? 'Kunde') : 'Unbekannt'
      threadMap.set(key, {
        fallId: n.fall_id,
        fallNummer: fallInfo?.fall_nummer ?? null,
        kundeName,
        lastMessage: n.nachricht?.slice(0, 80) ?? '',
        lastAt: n.created_at,
        unreadCount: 0,
        messages: [],
      })
    }
    threadMap.get(key)!.messages!.push(n)
    if (n.richtung === 'inbound') {
      threadMap.get(key)!.unreadCount++
    }
  }

  const threads = Array.from(threadMap.values())
    .sort((a, b) => (b.lastAt > a.lastAt ? 1 : -1))

  return (
    <NachrichtenInboxClient
      threads={threads as Thread[]}
      userId={user.id}
      isAdmin={isAdmin}
    />
  )
}
