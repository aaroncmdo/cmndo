'use client'

// AAR-730 / AAR-773: Kunden-zentrierter Chat-Layout-Wrapper.
// Konsolidiert seit AAR-773 auf den shared ChatInboxLayout — Sidebar-
// Logik dedupliziert mit ChatWithFallSidebar.

import ChatTimelineView, { type FallOption } from './ChatTimelineView'
import ChatInboxLayout, { type InboxThread } from './ChatInboxLayout'
import type { ChatKanal } from '@/lib/communications/channels'

export type KundenThread = {
  kundeId: string
  kundeName: string
  faelle: FallOption[]
  lastMessage: string
  lastAt: string
  unreadCount: number
}

export default function ChatWithKundenSidebar({
  threads,
  currentUserId,
  visibleKanaele,
  initialKundeId,
}: {
  threads: KundenThread[]
  currentUserId: string | null
  visibleKanaele: ChatKanal[]
  initialKundeId?: string | null
}) {
  const inboxThreads: InboxThread[] = threads.map((t) => ({
    id: t.kundeId,
    title: t.kundeName,
    subtitle: `${t.faelle.length > 1 ? `${t.faelle.length} Fälle · ` : ''}${t.lastMessage || '—'}`,
    lastAt: t.lastAt,
    unreadCount: t.unreadCount,
    searchKey: `${t.kundeName} ${t.faelle.map((f) => f.fallNummer ?? '').join(' ')} ${t.lastMessage}`,
  }))

  const byId = new Map(threads.map((t) => [t.kundeId, t]))

  return (
    <ChatInboxLayout
      threads={inboxThreads}
      initialThreadId={initialKundeId}
      emptyHint="Noch keine Kunden-Chats"
      searchPlaceholder="Kunde, Fall oder Text…"
      renderDetail={(id) => {
        const t = byId.get(id)
        if (!t) return null
        return (
          <>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-claimondo-navy">{t.kundeName}</h2>
              <p className="text-[11px] text-claimondo-ondo">
                {t.faelle.length} Fall{t.faelle.length === 1 ? '' : 'e'}
                {t.faelle.length > 0 && (
                  <>: {t.faelle.map((f) => `#${f.fallNummer ?? f.fallId.slice(0, 8)}`).join(', ')}</>
                )}
              </p>
            </div>
            <ChatTimelineView
              fallOptions={t.faelle}
              currentUserId={currentUserId}
              visibleKanaele={visibleKanaele}
            />
          </>
        )
      }}
    />
  )
}
