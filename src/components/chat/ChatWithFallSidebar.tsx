'use client'

// AAR-726 / AAR-773: Fall-zentrierter Chat-Layout-Wrapper.
// Konsolidiert seit AAR-773 auf den shared ChatInboxLayout — vorher
// hatte diese Datei eine eigene Sidebar-Implementierung, die zu 95%
// mit ChatWithKundenSidebar identisch war. Jetzt ein dünner Adapter
// der die FallThread-Shape auf die generische InboxThread-Shape mappt.

import MultiChannelChat from './MultiChannelChat'
import ChatInboxLayout, { type InboxThread } from './ChatInboxLayout'
import type { ChatKanal } from '@/lib/communications/channels'

export type FallThread = {
  fallId: string
  fallNummer: string | null
  kundeName: string
  lastMessage: string
  lastAt: string
  unreadCount: number
}

export default function ChatWithFallSidebar({
  threads,
  currentUserId,
  visibleKanaele,
  emptyHint,
  initialFallId,
}: {
  threads: FallThread[]
  currentUserId: string | null
  visibleKanaele: ChatKanal[]
  emptyHint?: string
  initialFallId?: string | null
}) {
  const inboxThreads: InboxThread[] = threads.map((t) => ({
    id: t.fallId,
    title: t.kundeName,
    subtitle: `${t.fallNummer ? `#${t.fallNummer} · ` : ''}${t.lastMessage || '—'}`,
    lastAt: t.lastAt,
    unreadCount: t.unreadCount,
    searchKey: `${t.kundeName} ${t.fallNummer ?? ''} ${t.lastMessage}`,
  }))

  const byId = new Map(threads.map((t) => [t.fallId, t]))

  return (
    <ChatInboxLayout
      threads={inboxThreads}
      initialThreadId={initialFallId}
      emptyHint={emptyHint ?? 'Noch keine Chats'}
      searchPlaceholder="Fall oder Kunde suchen…"
      renderDetail={(id) => {
        const t = byId.get(id)
        if (!t) return null
        return (
          <>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-claimondo-navy">{t.kundeName}</h2>
              {t.fallNummer && (
                <p className="text-[11px] text-claimondo-ondo">Fall #{t.fallNummer}</p>
              )}
            </div>
            <MultiChannelChat
              fallId={t.fallId}
              currentUserId={currentUserId}
              visibleKanaele={visibleKanaele}
              smartReplyDefault
            />
          </>
        )
      }}
    />
  )
}
