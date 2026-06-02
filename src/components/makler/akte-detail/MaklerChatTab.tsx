'use client'

// AAR-488 (M6): Chat-Tab fuer Makler-Akte-Detail. Realtime-Gruppenchat
// zwischen Kunde + KB + SV + Makler. Makler-Nachrichten sind fuer alle
// sichtbar. Nutzt die Kanaele `gruppenchat` + `chat_gruppe_mit_makler`.
//
// Chrome (Info-Banner + Card + Consent-Logik) bleibt hier. Der INNERE Chat
// (Message-Liste + Composer + load/realtime/dedup/optimistic/mark-read)
// delegiert an das geteilte <ChatThreadStream>-Primitive (Chat-Inbox P2,
// 2026-06-02). Damit entfallen: inline mark-read-UPDATE, inline-Realtime-
// Subscription, SSR-initialMessages-State und das Sender-Profil-Nachladen
// pro Nachricht. Die fruehere Avatar+Name-Anreicherung wird durch das
// Rolle-Label (bubbleVariant='tint', aus nachrichten.sender_rolle) ersetzt —
// das Primitive laedt bewusst keine Sender-Profile.

import ChatThreadStream from '@/components/chat/thread/ChatThreadStream'
import { maklerSender } from '@/lib/chat/thread/send-strategies'
import { InfoIcon } from 'lucide-react'
import type { MaklerChatMessage } from '@/lib/makler/queries'

type Props = {
  fallId: string
  currentUserId: string
  /**
   * SSR-Seed des Callers (MaklerAkteDetail). Das Primitive laedt clientseitig
   * selbst — der Seed wird hier nicht mehr verwendet, bleibt aber in der
   * Signatur, um den Caller nicht zu brechen.
   */
  initialMessages: MaklerChatMessage[]
}

const KANAELE = ['gruppenchat', 'chat_gruppe_mit_makler'] as const

export function MaklerChatTab({ fallId, currentUserId }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-claimondo-border overflow-hidden flex flex-col h-[60vh] min-h-[460px]">
      {/* Info-Banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-claimondo-ondo/10 border-b border-claimondo-border shrink-0">
        <span className="shrink-0 mt-0.5 text-claimondo-navy">
          <InfoIcon width={16} height={16} />
        </span>
        <p className="text-xs text-claimondo-navy leading-relaxed">
          <span className="font-semibold">Gruppenchat:</span> Sie sehen
          Nachrichten zwischen Kunde, Kundenbetreuer und Gutachter. Ihre
          Nachrichten sind für alle sichtbar.
        </p>
      </div>

      {/* Innerer Chat (Stream + Composer) — geteiltes Primitive. */}
      <div className="flex-1 min-h-0 bg-claimondo-bg">
        <ChatThreadStream
          scope={{ kind: 'fall', fallIds: [fallId], kanaele: [...KANAELE] }}
          currentUserId={currentUserId}
          send={maklerSender}
          bubbleVariant="tint"
          withDateSeparators
          readOnly={false}
          placeholder="Nachricht an die Gruppe schreiben …"
          emptyHint="Noch keine Nachrichten in diesem Fall."
        />
      </div>
    </div>
  )
}
