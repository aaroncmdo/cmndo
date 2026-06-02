'use client'

// AAR-383: Fokus-Chat-Panel für den Feldmodus.
// Chrome (Bottom-Sheet: Collapsed-Pill vs Expanded, ETA/Status-Header,
// Quick-Reply-Pills, Auto-Collapse bei sessionStatus='arrived') bleibt hier.
// Der INNERE Chat (Message-Stream + Composer + load/realtime/dedup/optimistic/
// mark-read) delegiert an das geteilte <ChatThreadStream>-Primitive.
//
// Chat-Inbox P2 (2026-06-02): die eigene supabase-Subscription, der Initial-Load,
// der mark-read-Counter und der lokale message-State sind durch die Engine ersetzt.
// markReadOnView ist hier bewusst TRUE — Fokus markierte zuvor NIE als gelesen,
// das ist eine gewollte Verbesserung (Design-Delta §5.2).

import { useEffect, useMemo, useState } from 'react'
import { ChevronUpIcon, MessageCircleIcon, XIcon } from 'lucide-react'
import ChatThreadStream from '@/components/chat/thread/ChatThreadStream'
import { standardSender } from '@/lib/chat/thread/send-strategies'
import {
  getQuickReplies,
  type QuickReplyContext,
} from '@/lib/sv/quick-replies'
import type { SessionStatus } from '@/lib/types/field-modus'

interface Props {
  fallId: string
  sessionStatus: SessionStatus
  etaMinutes: number | null
  terminAddress: string
  customerName: string
  fehlendeDokumente?: string[]
  /** Aktuelle SV-User-ID — für outbound/inbound-Unterscheidung im UI. */
  currentUserId: string | null
  /** Empfänger-ID (lead.user_id oder ähnlich), optional — sendChatMessage
   *  kommt ohne aus wenn null. */
  empfaengerId?: string | null
}

const KANAL = 'chat_kunde_sv' as const

export default function FokusChatPanel({
  fallId,
  sessionStatus,
  etaMinutes,
  terminAddress,
  customerName,
  fehlendeDokumente,
  currentUserId,
  empfaengerId,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  // Auto-Collapse beim Ankunfts-State (Fallakte braucht den Bildschirm).
  useEffect(() => {
    if (sessionStatus === 'arrived') setExpanded(false)
  }, [sessionStatus])

  const quickReplies = useMemo<ReturnType<typeof getQuickReplies>>(() => {
    const ctx: QuickReplyContext = {
      sessionStatus,
      etaMinutes,
      terminAddress,
      customerName,
      fehlendeDokumente,
    }
    return getQuickReplies(ctx)
  }, [
    sessionStatus,
    etaMinutes,
    terminAddress,
    customerName,
    fehlendeDokumente,
  ])

  if (!expanded) {
    // 2026-05-07 Polish: kollabierter Chat-Pill ist jetzt auch eine Glass-
    // Floating-Card analog zu FokusHeader/AktuellerStopCard. Mobile bleibt
    // full-width Bottom-Bar (Mobile-UX), Desktop ist eine Pill bottom-left
    // mit Glass-Tokens.
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[var(--brand-primary)]/20 shadow-lg px-4 py-2 flex items-center gap-3 hover:bg-claimondo-bg"
        aria-label="Chat öffnen"
      >
        <MessageCircleIcon className="w-5 h-5 text-claimondo-ondo shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo leading-tight">
            Chat mit {customerName || 'Kunde'}
          </p>
          <p className="text-xs text-claimondo-navy truncate">
            Tippen zum Öffnen · Quick-Replies verfügbar
          </p>
        </div>
        <ChevronUpIcon className="w-4 h-4 text-claimondo-ondo/70 shrink-0" />
      </button>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-[10vh] z-40 bg-white border-t border-[var(--brand-primary)]/20 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-claimondo-border flex items-center gap-2 shrink-0">
        <MessageCircleIcon className="w-4 h-4 text-[var(--brand-secondary)]" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo">
            Chat · {customerName || 'Kunde'}
          </p>
          <p className="text-xs text-claimondo-ondo">Direkt-Chat mit dem Kunden</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="p-1.5 rounded-ios-lg hover:bg-claimondo-bg text-claimondo-ondo"
          aria-label="Chat schließen"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Innerer Chat (Stream + Composer + Quick-Reply-Pills) — geteiltes Primitive. */}
      <div className="flex-1 min-h-0 bg-claimondo-bg">
        <ChatThreadStream
          scope={{ kind: 'fall', fallIds: [fallId], kanaele: [KANAL] }}
          currentUserId={currentUserId}
          send={standardSender}
          markReadOnView
          bubbleVariant="plain"
          sendEmpfaengerId={empfaengerId ?? null}
          placeholder="Eigene Nachricht tippen…"
          emptyHint="Noch keine Nachrichten. Tippen Sie eine Quick-Reply oder schreiben Sie eine eigene Nachricht."
          composerExtras={({ sendText }) => (
            <div className="-mx-3 -mt-3 mb-2 px-3 py-2 border-b border-claimondo-border overflow-x-auto whitespace-nowrap flex gap-2 scroll-smooth">
              {quickReplies.map((qr) => (
                <button
                  key={qr.id}
                  type="button"
                  onClick={() => sendText(qr.resolvedText)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--brand-secondary)]/10 hover:bg-[var(--brand-secondary)]/20 text-[var(--brand-primary)] text-xs font-medium flex-shrink-0"
                >
                  <span>{qr.emoji}</span>
                  {qr.label}
                </button>
              ))}
            </div>
          )}
        />
      </div>
    </div>
  )
}
