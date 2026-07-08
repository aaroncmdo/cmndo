'use client'

// Claim-natives Multi-Claim-Inbox-Layout (Thread-Modell). Reuse des shared
// ChatInboxLayout (Sidebar + Detail) mit ClaimChatPanel im Detail-Panel — so
// bekommt der Nutzer pro Fall Gruppe + Team-intern (Staff) + private DMs.
//
// Wird flag-gegated genutzt (kunde/chat ?chatv2=1). Der Default-Pfad bleibt der
// kanal-basierte ChatWithFallSidebar (unangetastet, da von mehreren Portalen
// geteilt) — dieser Wrapper ist additiv.

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
}

export default function ClaimChatInbox({
  eintraege,
  currentUserId,
  istStaff = false,
  initialClaimId,
  emptyHint,
}: {
  eintraege: ClaimInboxEintrag[]
  currentUserId: string
  istStaff?: boolean
  initialClaimId?: string | null
  emptyHint?: string
}) {
  const threads: InboxThread[] = eintraege.map((e) => ({
    id: e.claimId,
    title: e.title,
    subtitle: e.fallNummer ? `Fall #${e.fallNummer}` : 'Fall-Chat',
    lastAt: e.lastAt,
    unreadCount: 0, // Unread-Aggregation ueber Threads = Follow-up (v2 zeigt sie im Panel).
    searchKey: `${e.title} ${e.fallNummer ?? ''}`,
  }))
  const byId = new Map(eintraege.map((e) => [e.claimId, e]))

  return (
    <ChatInboxLayout
      threads={threads}
      initialThreadId={initialClaimId}
      emptyHint={emptyHint ?? 'Noch keine Chats'}
      searchPlaceholder="Fall suchen…"
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
