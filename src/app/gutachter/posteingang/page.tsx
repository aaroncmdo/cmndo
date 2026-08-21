import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import ClaimChatInbox from '@/components/chat/ClaimChatInbox'
import { ladeClaimUnreadCounts } from '@/lib/chat/thread-actions'

// AAR-722 + AAR-726: Gutachter-Posteingang ist jetzt reiner Chat-Bereich.
// System-Mitteilungen (AAR-370 Mitteilungen-Tab) leben ab jetzt in der
// Updates-Nav (AAR-725, in Arbeit). Der Posteingang zeigt nur noch
// Fall-Chats mit dem Kunden + Gruppen-Chat.
//
// Sichtbare Kanäle für SV: whatsapp, chat_kunde_sv, gruppenchat.
// Interne KB-Kommunikation (chat_kb_kunde, chat_kb_sv) bleibt unsichtbar —
// das ist Aufgabe des KB-Portals bzw. der geteilten Fallakte.

export const dynamic = 'force-dynamic'

type Search = { fall?: string }

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

  // Fall-Chat-Threads
  // CMM-65: created_at lebt auf claims (SSoT). supabase-js kann den Parent nicht nach
  // einer eingebetteten to-one-Spalte ordnen -> claims.created_at flachziehen + clientseitig
  // created_at-desc sortieren (erhaelt die threadMap-Insert-Reihenfolge der leeren Threads).
  // CMM-74 b″: Status-Filter auf claims.operative_status (SSoT-Cutover) statt faelle.status.
  // Zwei-Schritt: nicht-stornierte claim-IDs vorab holen, dann faelle.in('claim_id', …).
  // faelle.status wird hier nicht gelesen (nur claims.created_at + claim_nummer) → aus dem Select raus.
  // CMM-49 (faelle-Drop-Runway): via v_claim_full (flat, faelle-frei). vcf.id = claim_id;
  // fall_id == faelle.id; claim_nummer + created_at flach (SSoT).
  //
  // C5 (Doktrin §5, 14.08.): EIN Read statt zwei. Vorher lud ein Vorab-Select auf `claims`
  // ALLE nicht-stornierten Claim-IDs — systemweit, ungefiltert nach SV — nur um sie als
  // `.in('id', …)`-Liste zurueckzureichen. Das skaliert mit der Gesamtzahl der Claims,
  // obwohl der SV nur seine eigenen sieht. `v_claim_full` traegt `operative_status` selbst,
  // der Filter laeuft also direkt mit.
  // ⚠ Semantik unveraendert: `.not(col,'in',…)` schliesst NULL-Status genauso aus wie zuvor
  // (SQL: NOT (NULL IN (…)) ist NULL, also kein Treffer) — derselbe Ausdruck, nur eine Ebene
  // hoeher.
  const { data: faelleRaw } = await supabase
    .from('v_claim_full')
    .select('id, fall_id, lead_id, claim_nummer, created_at')
    .eq('sv_id', sv.id)
    .not('operative_status', 'in', '("storniert")')
  const claimCreatedAt = (f: { created_at?: string | null }): string => f.created_at ?? ''
  const faelle = (faelleRaw ?? [])
    .slice()
    .sort((a, b) => claimCreatedAt(b).localeCompare(claimCreatedAt(a)))

  // SV = Staff (istStaff=true -> team_intern sichtbar). Titel = Kundenname. claim-native id (Lehre #3910).
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
      emptyHint="Noch keine Kunden-Nachrichten. Sobald ein Fall zugewiesen ist, kannst du hier mit dem Kunden kommunizieren."
    />
  )
}
