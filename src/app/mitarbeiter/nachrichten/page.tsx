// KB-Nachrichten (mitarbeiter-Portal): claim-natives Thread-Modell (ClaimChatInbox).
// Scope = KB-eigene Claims (kundenbetreuer_id). KB ist Staff (is_staff -> team_intern sichtbar).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClaimChatInbox from '@/components/chat/ClaimChatInbox'
import { ladeClaimUnreadCounts } from '@/lib/chat/thread-actions'

export const dynamic = 'force-dynamic'

type Search = { fall?: string }

export default async function MitarbeiterNachrichten({
  searchParams,
}: {
  searchParams?: Promise<Search>
}) {
  const params = (await searchParams) ?? {}
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // KB-eigene Claims. v_claim_full: id = claim_id (ClaimChatPanel-nativ), fall_id = legacy,
  // claim_nummer/lead_id/created_at flach. Rollen-Guard liegt im Layout (requirePortalAccess).
  const { data: faelleRaw } = await supabase
    .from('v_claim_full')
    .select('id, fall_id, claim_nummer, lead_id, created_at')
    .eq('kundenbetreuer_id', user.id)

  const faelle = ((faelleRaw ?? []) as Array<{
    id: string
    fall_id: string
    claim_nummer: string | null
    lead_id: string | null
    created_at: string | null
  }>)
    .slice()
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))

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
      // Kein PageHeader auf dieser Seite — die Inbox-Ueberschrift IST der Seitentitel.
      titleLevel={1}
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
      emptyHint="Noch keine Kunden-Nachrichten."
    />
  )
}
