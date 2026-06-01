import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import ChatWithFallSidebar, { type FallThread } from '@/components/chat/ChatWithFallSidebar'
import { getInboxKanaele } from '@/lib/chat/kanal-routing'
import { getChatThreads } from '@/lib/chat/inbox-reader'

// AAR-722 + AAR-726 / P1 (01.06.2026): Gutachter-Posteingang (reiner Chat-Bereich).
// Threads aus dem zentralen claim-keyed Reader getChatThreads(); stornierte Claims
// werden ausgeschlossen (excludeStorniert). Sichtbare Kanaele aus getInboxKanaele
// ('sachverstaendiger') — Aaron 01.06.: inkl. WhatsApp + internem KB-SV-Kanal.

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

  const svKanaele = getInboxKanaele('sachverstaendiger')
  const chatThreads = await getChatThreads(supabase, {
    userId: user.id,
    rolle: 'sachverstaendiger',
    svId: sv.id,
    includeEmpty: true,
    excludeStorniert: true,
  })

  // Transitions-Bridge: ChatWithFallSidebar/MultiChannelChat oeffnen per fall_id.
  const threads: FallThread[] = chatThreads
    .filter((t) => t.fallId)
    .map((t) => ({
      fallId: t.fallId as string,
      fallNummer: t.claimNummer,
      kundeName: t.kundeName,
      lastMessage: t.lastMessage,
      lastAt: t.lastAt,
      unreadCount: t.unreadCount,
    }))

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
