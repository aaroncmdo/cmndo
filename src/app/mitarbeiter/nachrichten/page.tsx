// AAR-68 + AAR-102 + AAR-730: Mitarbeiter-Nachrichten, Kunden-zentriert.
// Sidebar listet Kunden (nicht Fälle), Timeline zeigt alle Fälle dieses
// Kunden durchmischt mit Fall-Badges pro Nachricht.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatWithKundenSidebar, {
  type KundenThread,
} from '@/components/chat/ChatWithKundenSidebar'

export const dynamic = 'force-dynamic'

// KB sieht: WhatsApp (Kunde), direkten Chat mit Kunde, Gruppen-Chat,
// KB-SV-Intern-Kanal. NICHT chat_kunde_sv — das ist Fallakte-only.
const KB_KANAELE = ['whatsapp', 'chat_kb_kunde', 'gruppenchat', 'chat_kb_sv'] as const

type Search = { kunde?: string }

export default async function MitarbeiterNachrichten({
  searchParams,
}: {
  searchParams?: Promise<Search>
}) {
  const params = (await searchParams) ?? {}
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, lead_id')
    .eq('kundenbetreuer_id', user.id)

  const fallMap = new Map((faelle ?? []).map(f => [f.id as string, f]))
  const fallIds = (faelle ?? []).map(f => f.id as string)

  // Nachrichten + Leads parallel.
  const [nachrichtenRes, leadsRes] = await Promise.all([
    fallIds.length > 0
      ? supabase
          .from('nachrichten')
          .select('id, fall_id, kanal, sender_id, nachricht, gelesen, created_at')
          .in('fall_id', fallIds)
          .in('kanal', KB_KANAELE as unknown as string[])
          .order('created_at', { ascending: false })
          .limit(800)
      : Promise.resolve({ data: [] as Array<{ id: string; fall_id: string | null; kanal: string; sender_id: string | null; nachricht: string | null; gelesen: boolean | null; created_at: string }> }),
    (async () => {
      const leadIds = Array.from(new Set((faelle ?? []).map(f => f.lead_id).filter(Boolean) as string[]))
      if (leadIds.length === 0) return { data: [] as Array<{ id: string; vorname: string | null; nachname: string | null }> }
      return supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
    })(),
  ])
  const nachrichten = nachrichtenRes.data ?? []
  const leads = leadsRes.data ?? []

  // Lead → Kundenname mappen.
  const kundenNameByLead = new Map(
    leads.map(l => [
      l.id as string,
      [l.vorname, l.nachname].filter(Boolean).join(' ') || 'Kunde',
    ]),
  )

  // Kunden-Threads aggregieren: pro lead_id ein Eintrag.
  const threadMap = new Map<string, KundenThread>()
  for (const fall of faelle ?? []) {
    const leadId = fall.lead_id as string | null
    if (!leadId) continue
    const kundeName = kundenNameByLead.get(leadId) ?? 'Kunde'
    if (!threadMap.has(leadId)) {
      threadMap.set(leadId, {
        kundeId: leadId,
        kundeName,
        faelle: [],
        lastMessage: '',
        lastAt: '',
        unreadCount: 0,
      })
    }
    const t = threadMap.get(leadId)!
    t.faelle.push({ fallId: fall.id as string, fallNummer: (fall.fall_nummer as string | null) ?? null })
  }

  // Nachrichten-Last-Info pro Kunden-Thread.
  for (const n of nachrichten) {
    if (!n.fall_id) continue
    const fall = fallMap.get(n.fall_id)
    if (!fall) continue
    const leadId = fall.lead_id as string | null
    if (!leadId) continue
    const t = threadMap.get(leadId)
    if (!t) continue
    if (!t.lastAt || n.created_at > t.lastAt) {
      t.lastAt = n.created_at
      t.lastMessage = (n.nachricht ?? '').slice(0, 80)
    }
    if (!n.gelesen && n.sender_id !== user.id) t.unreadCount++
  }

  const threads = Array.from(threadMap.values())
    .filter(t => t.faelle.length > 0)
    .sort((a, b) => {
      // Threads mit Nachrichten zuerst, dann nach Zeitstempel.
      if (a.lastAt && !b.lastAt) return -1
      if (!a.lastAt && b.lastAt) return 1
      return b.lastAt > a.lastAt ? 1 : -1
    })

  return (
    <ChatWithKundenSidebar
      threads={threads}
      currentUserId={user.id}
      visibleKanaele={[...KB_KANAELE]}
      initialKundeId={params.kunde ?? null}
    />
  )
}
