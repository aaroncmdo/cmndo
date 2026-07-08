import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOwnedClaimIds } from '@/lib/claims/owned-claims'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import ChatWithFallSidebar, { type FallThread } from '@/components/chat/ChatWithFallSidebar'
import ClaimChatInbox from '@/components/chat/ClaimChatInbox'
import { ladeClaimUnreadCounts } from '@/lib/chat/thread-actions'
import PageHeader from '@/components/shared/PageHeader'
import { getInboxKanaele } from '@/lib/chat/kanal-routing'

// AAR-730: Kunde-Chat auf MultiChannelChat-Basis migriert. Sichtbare Kanaele
// kommen aus getInboxKanaele('kunde') (zentrale SSoT). 01.06.2026 (Aaron): inkl.
// WhatsApp, damit der Kunde seine Kommunikation vollstaendig ueberblickt.

export const dynamic = 'force-dynamic'

const KUNDE_KANAELE = getInboxKanaele('kunde')

type Search = { fall?: string; chatv2?: string }

export default async function KundeChatPage({
  searchParams,
}: {
  searchParams?: Promise<Search>
}) {
  const params = (await searchParams) ?? {}
  const t = await getTranslations('kunde.settings')
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
  // CMM-65: created_at lebt auf claims (SSoT). CMM-49: via v_claim_full (flat, faelle-frei) —
  // vcf.id = claim_id (Filter), fall_id == faelle.id, claim_nummer/created_at flach. Sortierung
  // clientseitig created_at-desc (juengster Fall zuerst).
  // CMM-49: vcf.id = claim_id, fall_id == legacy faelle.id. Beide laden — der
  // kanal-basierte v1-Pfad arbeitet fall-nativ (fall_id), der thread-basierte
  // v2-Pfad (ClaimChatInbox) claim-nativ (claim_id).
  type FallRow = { id: string; fall_id: string; lead_id: string | null; claim_nummer: string | null; created_at: string | null }
  const { data: faelleData } = await admin
    .from('v_claim_full')
    .select('id, fall_id, lead_id, claim_nummer, created_at')
    .in('id', ownedClaimIds)
  const faelle = ((faelleData ?? []) as FallRow[])
    .map(f => ({ id: f.fall_id, claimId: f.id, claim_nummer: f.claim_nummer ?? null, lead_id: f.lead_id, _c: f.created_at ?? '' }))
    .sort((a, b) => b._c.localeCompare(a._c))

  if (faelle.length === 0) {
    return (
      <div className="px-5 py-8 max-w-lg mx-auto space-y-4">
        <PageHeader title={t('chat.title')} size="lg" />
        <div className="bg-white rounded-2xl border border-claimondo-border shadow-sm p-8 text-center">
          <p className="text-claimondo-ondo text-sm">
            {t('chat.emptyFall')}
          </p>
        </div>
      </div>
    )
  }

  // Phase-2c Cutover-Flag: ?chatv2=1 -> claim-natives Thread-Modell (ClaimChatInbox:
  // Gruppe + private DMs pro Fall) statt kanal-basierter ChatWithFallSidebar.
  // Default aus -> unveraendert, null Prod-Risiko. Kunde = kein Staff (istStaff=false).
  if (params.chatv2 === '1') {
    const unreadRes = await ladeClaimUnreadCounts(faelle.map(f => f.claimId))
    const unread = unreadRes.ok ? unreadRes.data : {}
    return (
      <ClaimChatInbox
        eintraege={faelle.map(f => ({
          claimId: f.claimId,
          title: t('chat.meinFall'),
          fallNummer: f.claim_nummer,
          lastAt: f._c,
          unreadCount: unread[f.claimId] ?? 0,
        }))}
        currentUserId={user.id}
        istStaff={false}
        initialClaimId={faelle.find(f => f.id === params.fall)?.claimId ?? null}
        emptyHint={t('chat.emptyHint')}
      />
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
      kundeName: t('chat.meinFall'),
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
      emptyHint={t('chat.emptyHint')}
    />
  )
}
