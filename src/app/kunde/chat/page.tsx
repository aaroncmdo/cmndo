import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ChatWithFallSidebar, { type FallThread } from '@/components/chat/ChatWithFallSidebar'
import PageHeader from '@/components/shared/PageHeader'
import { getInboxKanaele } from '@/lib/chat/kanal-routing'
import { getChatThreads } from '@/lib/chat/inbox-reader'

// AAR-730 / P1 (01.06.2026): Kunde-Chat. Threads kommen aus dem zentralen
// claim-keyed Reader getChatThreads(). Sichtbare Kanaele aus getInboxKanaele('kunde')
// (Aaron 01.06.: inkl. WhatsApp, damit der Kunde alles ueberblickt). Service-Role-
// Client, weil getOwnedClaimIds (Ownership-Lookup) RLS-Bypass braucht.

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

  const admin = createAdminClient()
  const chatThreads = await getChatThreads(admin, {
    userId: user.id,
    rolle: 'kunde',
    email: user.email ?? null,
    includeEmpty: true,
  })

  if (chatThreads.length === 0) {
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

  // Transitions-Bridge: ChatWithFallSidebar/MultiChannelChat oeffnen per fall_id.
  const threads: FallThread[] = chatThreads
    .filter((t) => t.fallId)
    .map((t) => ({
      fallId: t.fallId as string,
      fallNummer: t.claimNummer,
      kundeName: 'Mein Fall',
      lastMessage: t.lastMessage,
      lastAt: t.lastAt,
      unreadCount: t.unreadCount,
    }))

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
