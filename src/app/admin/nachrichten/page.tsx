// Admin/KB/Dispatch Nachrichten-Inbox: claim-natives Thread-Modell (ClaimChatInbox).
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { roleToPath } from '@/lib/auth/role-redirect'
import ClaimChatInbox from '@/components/chat/ClaimChatInbox'
import { ladeClaimUnreadCounts } from '@/lib/chat/thread-actions'

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

  // AAR-719: Defensiv — bei falscher Rolle ins eigene Portal statt /admin.
  if (!profile || !['admin', 'kundenbetreuer', 'dispatch'].includes(profile.rolle)) {
    redirect(profile?.rolle ? roleToPath(profile.rolle as string) : '/login')
  }

  // Admin/KB/Dispatch = Staff (is_staff-RLS sieht alle Threads). Zeigt Claims mit
  // Thread-Aktivitaet, neueste zuerst. claim-native id (Lehre #3910).
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
  // titleLevel={1}: diese Seite hat keinen PageHeader, die Inbox-Ueberschrift IST der
  // Seitentitel. Ohne das bleibt die Seite ganz ohne h1 (21.08. live gemessen).
  return <ClaimChatInbox titleLevel={1} eintraege={eintraege} currentUserId={user.id} istStaff emptyHint="Noch keine Chat-Threads." />
}
