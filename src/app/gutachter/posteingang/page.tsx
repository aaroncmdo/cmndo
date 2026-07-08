import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import ChatWithFallSidebar, { type FallThread } from '@/components/chat/ChatWithFallSidebar'
import ClaimChatInbox from '@/components/chat/ClaimChatInbox'
import { ladeClaimUnreadCounts } from '@/lib/chat/thread-actions'
import { getInboxKanaele } from '@/lib/chat/kanal-routing'

// AAR-722 + AAR-726: Gutachter-Posteingang ist jetzt reiner Chat-Bereich.
// System-Mitteilungen (AAR-370 Mitteilungen-Tab) leben ab jetzt in der
// Updates-Nav (AAR-725, in Arbeit). Der Posteingang zeigt nur noch
// Fall-Chats mit dem Kunden + Gruppen-Chat.
//
// Sichtbare Kanäle für SV: whatsapp, chat_kunde_sv, gruppenchat.
// Interne KB-Kommunikation (chat_kb_kunde, chat_kb_sv) bleibt unsichtbar —
// das ist Aufgabe des KB-Portals bzw. der geteilten Fallakte.

export const dynamic = 'force-dynamic'

type Search = { fall?: string; chatv2?: string }

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

  // SV-Inbox-Kanaele aus zentraler SSoT.
  const svKanaele = getInboxKanaele('sachverstaendiger')

  // Fall-Chat-Threads
  // CMM-65: created_at lebt auf claims (SSoT). supabase-js kann den Parent nicht nach
  // einer eingebetteten to-one-Spalte ordnen -> claims.created_at flachziehen + clientseitig
  // created_at-desc sortieren (erhaelt die threadMap-Insert-Reihenfolge der leeren Threads).
  // CMM-74 b″: Status-Filter auf claims.operative_status (SSoT-Cutover) statt faelle.status.
  // Zwei-Schritt: nicht-stornierte claim-IDs vorab holen, dann faelle.in('claim_id', …).
  // faelle.status wird hier nicht gelesen (nur claims.created_at + claim_nummer) → aus dem Select raus.
  const { data: nichtStornierteClaims } = await supabase
    .from('claims')
    .select('id')
    .not('operative_status', 'in', '("storniert")')
  const aktiveClaimIds = (nichtStornierteClaims ?? []).map((c) => c.id as string)
  // CMM-49 (faelle-Drop-Runway): via v_claim_full (flat, faelle-frei). vcf.id = claim_id (Filter);
  // fall_id == faelle.id; claim_nummer + created_at flach (SSoT).
  const { data: faelleRaw } = aktiveClaimIds.length
    ? await supabase
        .from('v_claim_full')
        .select('id, fall_id, lead_id, claim_nummer, created_at')
        .eq('sv_id', sv.id)
        .in('id', aktiveClaimIds)
    : { data: [] as Array<{ id: string; fall_id: string; lead_id: string | null; claim_nummer: string | null; created_at: string | null }> }
  const claimCreatedAt = (f: { created_at?: string | null }): string => f.created_at ?? ''
  const faelle = (faelleRaw ?? [])
    .slice()
    .sort((a, b) => claimCreatedAt(b).localeCompare(claimCreatedAt(a)))

  // Phase-2c Cutover-Flag: claim-natives Thread-Modell (ClaimChatInbox) ist jetzt DEFAULT.
  // SV = Staff (istStaff=true -> team_intern sichtbar). Titel = Kundenname. Escape-Hatch
  // ?chatv2=0 -> v1. claim-native id (f.id), NICHT fall_id (Lehre #3910).
  if (params.chatv2 !== '0') {
    const leadIds = Array.from(new Set(faelle.map(f => f.lead_id).filter(Boolean) as string[]))
    const kundenMap: Record<string, string> = {}
    if (leadIds.length > 0) {
      const { data: leads } = await supabase.from('leads').select('id, vorname, nachname').in('id', leadIds)
      for (const l of leads ?? []) kundenMap[l.id as string] = [l.vorname, l.nachname].filter(Boolean).join(' ') || 'Kunde'
    }
    const unreadRes = await ladeClaimUnreadCounts(faelle.map(f => f.id))
    const unread = unreadRes.ok ? unreadRes.data : {}
    return (
      <ClaimChatInbox
        eintraege={faelle.map(f => ({
          claimId: f.id,
          title: f.lead_id ? (kundenMap[f.lead_id] ?? 'Kunde') : 'Kunde',
          fallNummer: f.claim_nummer ?? null,
          lastAt: f.created_at ?? '',
          unreadCount: unread[f.id] ?? 0,
        }))}
        currentUserId={user.id}
        istStaff={true}
        initialClaimId={faelle.find(f => f.fall_id === params.fall)?.id ?? null}
        emptyHint="Noch keine Kunden-Nachrichten. Sobald ein Fall zugewiesen ist, kannst du hier mit dem Kunden kommunizieren."
      />
    )
  }

  const fallIds = (faelle ?? []).map(f => f.fall_id)
  const threads: FallThread[] = []

  if (fallIds.length > 0) {
    // AAR-722: Kanal-Filter im Server-Query — SV sieht nur seine Inbox-Kanaele
    // (svKanaele aus der zentralen SSoT). KB-interne Kanaele werden gar nicht geladen.
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
      threadMap.set(fall.fall_id, {
        fallId: fall.fall_id,
        fallNummer: fall.claim_nummer ?? null,
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
      visibleKanaele={svKanaele}
      emptyHint="Noch keine Kunden-Nachrichten. Sobald ein Fall zugewiesen ist, kannst du hier mit dem Kunden kommunizieren."
      initialFallId={params.fall ?? null}
    />
  )
}
