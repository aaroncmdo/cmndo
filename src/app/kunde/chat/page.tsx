import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { MessageCircleIcon } from 'lucide-react'
import ChatWithFallSidebar, { type FallThread } from '@/components/chat/ChatWithFallSidebar'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'

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

  // AAR-730 + AAR-730-hotfix: Alle Fälle des Kunden laden.
  // Ownership via kunde_id UND lead.email (Kunde kann alte lead-basierte +
  // neue kunde_id-basierte Fälle haben — wir mergen beide Quellen und
  // dedupen auf id).
  const admin = createAdminClient()

  const [direktRes, leadsRes] = await Promise.all([
    supabase
      .from('faelle')
      .select('id, fall_nummer, lead_id, created_at')
      .eq('kunde_id', user.id)
      .order('created_at', { ascending: false }),
    user.email
      ? admin.from('leads').select('id').eq('email', user.email)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
  ])
  const direktFaelle = (direktRes.data ?? []) as Array<{ id: string; fall_nummer: string | null; lead_id: string | null; created_at: string }>
  const leadIds = (leadsRes.data ?? []).map(l => l.id as string)

  let leadFaelle: typeof direktFaelle = []
  if (leadIds.length > 0) {
    const { data } = await admin
      .from('faelle')
      .select('id, fall_nummer, lead_id, created_at')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false })
    leadFaelle = (data ?? []) as typeof direktFaelle
  }

  // Dedup auf id, chronologisch sortiert.
  const byId = new Map<string, { id: string; fall_nummer: string | null; lead_id: string | null; created_at: string }>()
  for (const f of [...direktFaelle, ...leadFaelle]) byId.set(f.id, f)
  const faelle = Array.from(byId.values())
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    .map(f => ({ id: f.id, fall_nummer: f.fall_nummer, lead_id: f.lead_id }))

  if (faelle.length === 0) {
    return (
      <div className="px-5 py-8 max-w-lg mx-auto space-y-4">
        <PageHeader title="Chat" size="lg" />
        <EmptyState
          icon={MessageCircleIcon}
          title="Chat startet mit Ihrem Schadensfall"
          description="Sobald Ihr Fall angelegt ist, können Sie hier direkt mit Ihrem Kundenbetreuer und Sachverständigen chatten — auch in Gruppe."
          actions={[
            { label: 'Schaden melden', href: '/schaden-melden/schritt-1' },
          ]}
        />
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
