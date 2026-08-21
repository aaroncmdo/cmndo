'use client'

// Claim-natives Multi-Claim-Inbox-Layout (Thread-Modell). Reuse des shared
// ChatInboxLayout (Sidebar + Detail) mit ClaimChatPanel im Detail-Panel — so
// bekommt der Nutzer pro Fall Gruppe + Team-intern (Staff) + private DMs.
//
// Consumer (v2-Default): kunde/chat, admin/nachrichten, gutachter/posteingang.
// Der frühere kanal-basierte v1-Pfad (ChatWithFallSidebar) wurde entfernt (Phase 1).

import ChatInboxLayout, { type InboxThread } from './ChatInboxLayout'
import { ClaimChatPanel } from './ClaimChatPanel'

export type ClaimInboxEintrag = {
  /** claims.id — ClaimChatPanel/thread-actions sind claim-nativ (NICHT fall_id). */
  claimId: string
  /** Anzeige-Titel (z.B. "Mein Fall"). */
  title: string
  /** Fall-/Claim-Nummer fuer die Untertitel-Zeile. */
  fallNummer: string | null
  /** Letzte Aktivitaet (ISO) fuer die Sortierung/Anzeige. */
  lastAt: string
  /** Ungelesene Nachrichten (fremd, nach zuletzt_gelesen_am) fuer das Sidebar-Badge. */
  unreadCount: number
}

export default function ClaimChatInbox({
  eintraege,
  currentUserId,
  istStaff = false,
  initialClaimId,
  emptyHint,
  titleLevel,
}: {
  eintraege: ClaimInboxEintrag[]
  currentUserId: string
  istStaff?: boolean
  initialClaimId?: string | null
  emptyHint?: string
  /** Durchgereicht an ChatInboxLayout — `1`, wenn die Seite keinen eigenen Page-H1 hat. */
  titleLevel?: 1 | 2
}) {
  const threads: InboxThread[] = eintraege.map((e) => ({
    id: e.claimId,
    title: e.title,
    subtitle: e.fallNummer ? `Fall #${e.fallNummer}` : 'Fall-Chat',
    lastAt: e.lastAt,
    unreadCount: e.unreadCount,
    searchKey: `${e.title} ${e.fallNummer ?? ''}`,
  }))
  const byId = new Map(eintraege.map((e) => [e.claimId, e]))

  return (
    <ChatInboxLayout
      threads={threads}
      initialThreadId={initialClaimId}
      emptyHint={emptyHint ?? 'Noch keine Chats'}
      searchPlaceholder="Fall suchen…"
      titleLevel={titleLevel}
      renderDetail={(id) => {
        const e = byId.get(id)
        if (!e) return null
        return (
          <div className="h-full min-h-0">
            <ClaimChatPanel claimId={e.claimId} currentUserId={currentUserId} istStaff={istStaff} />
          </div>
        )
      }}
    />
  )
}
