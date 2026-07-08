// AAR-102: Multi-Channel Inbox mit Split-View + MultiChannelChat
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { roleToPath } from '@/lib/auth/role-redirect'
import NachrichtenInboxClient from './NachrichtenInboxClient'
import ClaimChatInbox from '@/components/chat/ClaimChatInbox'
import { ladeClaimUnreadCounts } from '@/lib/chat/thread-actions'
import { getInboxKanaele } from '@/lib/chat/kanal-routing'

export const dynamic = 'force-dynamic'

export default async function NachrichtenPage({
  searchParams,
}: {
  searchParams?: Promise<{ chatv2?: string }>
}) {
  const params = (await searchParams) ?? {}
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

  // Phase-2c Cutover-Flag: ?chatv2=1 -> claim-natives Thread-Modell (ClaimChatInbox).
  // Admin/KB/Dispatch = Staff (is_staff-RLS sieht alle Threads). Zeigt Claims mit
  // Thread-Aktivitaet, neueste zuerst. Default aus -> Multi-Channel-Inbox v1 unveraendert
  // (bis das Zustellungs-Routing Thread<->WhatsApp/E-Mail existiert). claim-native id (Lehre #3910).
  if (params.chatv2 === '1') {
    const admin = createAdminClient()
    const { data: tmsgs } = await admin
      .from('nachrichten')
      .select('created_at, chat_threads!inner(claim_id)')
      .not('thread_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500)
    const lastAt = new Map<string, string>()
    for (const m of (tmsgs ?? []) as Array<{ created_at: string; chat_threads: { claim_id: string } | { claim_id: string }[] }>) {
      const ct = Array.isArray(m.chat_threads) ? m.chat_threads[0] : m.chat_threads
      if (ct?.claim_id && !lastAt.has(ct.claim_id)) lastAt.set(ct.claim_id, m.created_at)
    }
    const claimIds = [...lastAt.keys()]
    let eintraege: Array<{ claimId: string; title: string; fallNummer: string | null; lastAt: string; unreadCount: number }> = []
    if (claimIds.length > 0) {
      const { data: claimRows } = await admin
        .from('claims')
        .select('id, claim_nummer, geschaedigter_user_id')
        .in('id', claimIds)
      const meta = new Map(
        ((claimRows ?? []) as Array<{ id: string; claim_nummer: string | null; geschaedigter_user_id: string | null }>)
          .map((c) => [c.id, c]),
      )
      const kundeIds = [...meta.values()].map((c) => c.geschaedigter_user_id).filter(Boolean) as string[]
      const nameMap = new Map<string, string>()
      if (kundeIds.length > 0) {
        const { data: profs } = await admin.from('profiles').select('id, anzeigename, vorname, nachname').in('id', kundeIds)
        for (const p of (profs ?? []) as Array<{ id: string; anzeigename: string | null; vorname: string | null; nachname: string | null }>) {
          nameMap.set(p.id, p.anzeigename ?? ([p.vorname, p.nachname].filter(Boolean).join(' ') || 'Kunde'))
        }
      }
      const unreadRes = await ladeClaimUnreadCounts(claimIds)
      const unread = unreadRes.ok ? unreadRes.data : {}
      eintraege = claimIds.map((cid) => {
        const c = meta.get(cid)
        const kunde = c?.geschaedigter_user_id ? nameMap.get(c.geschaedigter_user_id) : null
        return {
          claimId: cid,
          title: kunde ?? c?.claim_nummer ?? 'Fall',
          fallNummer: c?.claim_nummer ?? null,
          lastAt: lastAt.get(cid) ?? '',
          unreadCount: unread[cid] ?? 0,
        }
      })
    }
    return <ClaimChatInbox eintraege={eintraege} currentUserId={user.id} istStaff emptyHint="Noch keine Chat-Threads." />
  }

  // Fetch letzte 500 Nachrichten in sichtbaren Kanaelen
  const { data: nachrichten } = await supabase
    .from('nachrichten')
    .select('id, fall_id, kanal, sender_id, sender_rolle, nachricht, gelesen, created_at')
    .in('kanal', getInboxKanaele(profile.rolle))
    .not('fall_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  const fallIds = Array.from(new Set((nachrichten ?? []).map(n => n.fall_id).filter(Boolean) as string[]))
  const fallMap: Record<string, { claim_nummer: string | null; lead_id: string | null; kennzeichen: string | null }> = {}

  if (fallIds.length > 0) {
    // CMM-49: faelle->v_claim_full (claim-anchored SSoT). claim_nummer flach statt
    // claims-Embed, kennzeichen via vehicles. id:fall_id-Alias haelt die fallMap-Keys
    // (=faelle.id); fall_id-Guard, da die View-Spalte nullable ist (Orphan-Claims).
    const { data: faelle } = await supabase
      .from('v_claim_full')
      .select('id:fall_id, claim_nummer, lead_id, kennzeichen')
      .in('fall_id', fallIds)
    for (const f of faelle ?? []) {
      if (!f.id) continue
      fallMap[f.id] = { claim_nummer: f.claim_nummer ?? null, lead_id: f.lead_id, kennzeichen: f.kennzeichen }
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
        fallNummer: info?.claim_nummer ?? null,
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
