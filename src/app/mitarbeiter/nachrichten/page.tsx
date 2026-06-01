// AAR-68 + AAR-102 + AAR-730 / P1 (01.06.2026): Mitarbeiter-Nachrichten, kunden-
// zentriert. Threads aus dem zentralen Reader getChatThreads(), dann per
// groupThreadsByKunde() zu Kunden gebuendelt. Sichtbare Kanaele = getInboxKanaele
// ('kundenbetreuer') (ohne chat_kunde_sv — das ist Fallakte-only).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatWithKundenSidebar, {
  type KundenThread,
} from '@/components/chat/ChatWithKundenSidebar'
import { getInboxKanaele } from '@/lib/chat/kanal-routing'
import { getChatThreads, groupThreadsByKunde } from '@/lib/chat/inbox-reader'

export const dynamic = 'force-dynamic'

const KB_KANAELE = getInboxKanaele('kundenbetreuer')

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

  const chatThreads = await getChatThreads(supabase, {
    userId: user.id,
    rolle: 'kundenbetreuer',
    includeEmpty: true,
  })

  // Claim-Threads zu Kunden buendeln; fall_id als Transitions-Bridge fuer die Timeline.
  const threads: KundenThread[] = groupThreadsByKunde(chatThreads)
    .map((g) => ({
      kundeId: g.leadId,
      kundeName: g.kundeName,
      faelle: g.faelle
        .filter((f) => f.fallId)
        .map((f) => ({ fallId: f.fallId as string, fallNummer: f.claimNummer })),
      lastMessage: g.lastMessage,
      lastAt: g.lastAt,
      unreadCount: g.unreadCount,
    }))
    .filter((t) => t.faelle.length > 0)

  return (
    <ChatWithKundenSidebar
      threads={threads}
      currentUserId={user.id}
      visibleKanaele={KB_KANAELE}
      initialKundeId={params.kunde ?? null}
    />
  )
}
