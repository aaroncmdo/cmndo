import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOwnedClaimIds } from '@/lib/claims/owned-claims'
import { redirect } from 'next/navigation'
import ChatWithFallSidebar, { type FallThread } from '@/components/chat/ChatWithFallSidebar'
import PageHeader from '@/components/shared/PageHeader'
import { getInboxKanaele } from '@/lib/chat/kanal-routing'

// AAR-730: Kunde-Chat auf MultiChannelChat-Basis migriert.
// Sichtbare Kanäle für Kunde: direkter Chat mit KB, direkter Chat mit SV,
// Gruppen-Chat (alle drei). WhatsApp bewusst NICHT im Kunde-UI — Kunde
// nutzt WhatsApp außerhalb der App, eingehende Nachrichten sind im Chat
// sichtbar via chat_kb_kunde-Alias.

export const dynamic = 'force-dynamic'

const KUNDE_KANAELE = getInboxKanaele('kunde')

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

  // CMM-63 SP-C: owned claim_ids über claim_parties — subsumiert das frühere
  // kunde_id-Read + lead-email-Merge in EINER Ownership-Quelle. Dann die faelle
  // dieser Claims laden (id/lead_id/created_at faelle-nativ bis Phase 6).
  const ownedClaimIds = await getOwnedClaimIds(admin, user.id, user.email ?? null)
  // CMM-65: created_at lebt auf claims (SSoT). supabase-js kann nicht nach eingebetteter
  // to-one-Spalte ordnen -> claims.created_at via !inner mitladen + clientseitig
  // created_at-desc sortieren (juengster Fall zuerst, wie bisher).
  type ClaimEmbed = { claim_nummer: string | null; created_at: string | null } | { claim_nummer: string | null; created_at: string | null }[] | null
  type FallRow = { id: string; lead_id: string | null; claims: ClaimEmbed }
  const { data: faelleData } = await admin
    .from('faelle')
    .select('id, lead_id, claims:claim_id!inner(claim_nummer, created_at)')
    .in('claim_id', ownedClaimIds)
  const faelle = ((faelleData ?? []) as FallRow[])
    .map(f => {
      const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
      return { id: f.id, claim_nummer: c?.claim_nummer ?? null, lead_id: f.lead_id, _c: c?.created_at ?? '' }
    })
    .sort((a, b) => b._c.localeCompare(a._c))

  if (faelle.length === 0) {
    return (
      <div className="px-5 py-8 max-w-lg mx-auto space-y-4">
        <PageHeader title="Chat" size="lg" />
        <div className="bg-white rounded-2xl border border-claimondo-border shadow-sm p-8 text-center">
          <p className="text-claimondo-ondo text-sm">
            Noch kein Schadensfall vorhanden. Sobald Ihr Fall erstellt wurde, können Sie hier
            mit Ihrem Kundenbetreuer und dem Gutachter chatten.
          </p>
        </div>
      </div>
    )
  }

  const fallIds = faelle.map(f => f.id)

  // Nachrichten pro Fall aggregieren.
  const { data: nachrichten } = await admin
    .from('nachrichten')
    .select('id, fall_id, kanal, sender_id, nachricht, gelesen, created_at')
    .in('fall_id', fallIds)
    .in('kanal', KUNDE_KANAELE)
    .order('created_at', { ascending: false })
    .limit(500)

  const threadMap = new Map<string, FallThread>()
  for (const fall of faelle) {
    threadMap.set(fall.id, {
      fallId: fall.id,
      fallNummer: fall.claim_nummer,
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
      visibleKanaele={KUNDE_KANAELE}
      initialFallId={params.fall ?? null}
      emptyHint="Noch keine Nachrichten. Sobald dein Kundenbetreuer oder Gutachter etwas schreibt, landet es hier."
    />
  )
}
