// AAR-102 / P1 (01.06.2026): Admin/KB/Dispatch-Inbox. Threads aus dem zentralen
// claim-keyed Reader getChatThreads(); Kanaele rollenabhaengig via getInboxKanaele
// (intern im Reader). kennzeichen + lastKanal kommen aus v_claim_full bzw. der
// letzten Nachricht. Nur Threads MIT Nachricht (includeEmpty=false, wie bisher).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { roleToPath } from '@/lib/auth/role-redirect'
import NachrichtenInboxClient from './NachrichtenInboxClient'
import { getChatThreads } from '@/lib/chat/inbox-reader'

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

  const chatThreads = await getChatThreads(supabase, {
    userId: user.id,
    rolle: profile.rolle as string,
  })

  // Transitions-Bridge: NachrichtenInboxClient/MultiChannelChat oeffnen per fall_id.
  const threads = chatThreads
    .filter((t) => t.fallId)
    .map((t) => ({
      fallId: t.fallId as string,
      fallNummer: t.claimNummer,
      kennzeichen: t.kennzeichen,
      kundeName: t.kundeName,
      lastMessage: t.lastMessage,
      lastAt: t.lastAt,
      lastKanal: t.lastKanal ?? '',
      unreadCount: t.unreadCount,
    }))

  return <NachrichtenInboxClient threads={threads} currentUserId={user.id} />
}
