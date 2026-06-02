'use client'

// Chat-Inbox P2: KundeKbChat ist jetzt ein duenner Wrapper ueber ChatThreadStream.
// Public API (Props) bleibt unveraendert -> die 2 Consumer (KundenbetreuerCard +
// GutachterCard) kompilieren weiter ohne Aenderung.
//
// Outlier-Scope: EIN Kanal ('chat_kb_kunde' | 'gruppenchat') + Sender-Allowlist
// (Kunde + Partner + ggf. KB/Admin als Mitleser). fall_id pro Nachricht optional:
// der Fall-Bezug-Picker (composerExtras) erlaubt es, eine Nachricht explizit auf
// einen Fall zu beziehen ("Bezug: CLM-2026…"). Ohne Auswahl = fall_id NULL.
//
// Load/Realtime/Optimistic/Mark-Read macht jetzt die Engine (useChatThread via
// ChatThreadStream) — dieser Wrapper haelt nur noch den Fall-Picker-State + die
// aeussere Glass-Chrome.

import { useMemo, useState } from 'react'
import { FileTextIcon, XIcon } from 'lucide-react'
import ChatThreadStream from '@/components/chat/thread/ChatThreadStream'
import { kundeSender } from '@/lib/chat/thread/send-strategies'
import { markKundeChatMessagesRead, type KundeChatKanal } from './kb-chat-actions'
import type { ChatScope } from '@/lib/chat/thread/scope'

type FallOption = {
  id: string
  claim_nummer: string | null
}

type SenderInfo = {
  name: string
  rolle: 'kb' | 'sv' | 'kunde'
  avatarUrl?: string | null
}

type Props = {
  currentUserId: string
  /** Partner-User-ID — KB beim Direktchat, SV beim Gruppenchat */
  partnerUserId: string
  /** Zusätzliche Sender-IDs die in diesem Channel mitlesen (z.B. KB beim
   *  gruppenchat sendet ebenfalls — ihre Nachrichten sollen sichtbar sein) */
  additionalSenderIds?: string[]
  kanal: KundeChatKanal
  fallOptions: FallOption[]
  /** Default-Fall der vorausgewählt wird (singleFallId). Null = "Allgemein". */
  defaultFallId: string | null
  placeholder?: string
  /** Map user_id → Anzeigename + Rolle. Wird ueber den Bubbles als Label
   *  gerendert, damit klar ist wer geschrieben hat (relevant bei Gruppenchat). */
  senderLabels?: Record<string, SenderInfo>
}

export default function KundeKbChat({
  currentUserId,
  partnerUserId,
  additionalSenderIds = [],
  kanal,
  fallOptions,
  defaultFallId,
  placeholder = 'Nachricht …',
  senderLabels,
}: Props) {
  const [selectedFallId, setSelectedFallId] = useState<string | null>(defaultFallId)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Allowlist-Scope: EIN Kanal + alle erlaubten Sender (Kunde + Partner + Mitleser).
  const additionalKey = additionalSenderIds.join(',')
  const scope = useMemo<ChatScope>(
    () => ({
      kind: 'kanal-allowlist',
      kanal,
      senderAllowlist: [currentUserId, partnerUserId, ...additionalSenderIds].filter(
        (id): id is string => Boolean(id),
      ),
    }),
    // additionalKey serialisiert das Array -> stabile Identitaet (kein Re-Subscribe).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kanal, currentUserId, partnerUserId, additionalKey],
  )

  const selectedFall = fallOptions.find((f) => f.id === selectedFallId) ?? null

  // Fall-Bezug-Picker: rendert ueber dem Composer-Input (extras-Slot). Setzt
  // selectedFallId -> wird via sendFallId an die Engine durchgereicht.
  const composerExtras =
    fallOptions.length > 0 ? (
      <div className="mb-1.5">
        {selectedFall && (
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-ios-md bg-claimondo-navy/5 border-l-[3px] border-claimondo-navy pl-2 pr-1.5 py-1 text-[11px] text-claimondo-navy">
            <FileTextIcon className="w-3 h-3 text-claimondo-navy/70 shrink-0" />
            <span>
              Bezug:{' '}
              <span className="font-mono font-semibold">
                {selectedFall.claim_nummer ?? selectedFall.id.slice(0, 8)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedFallId(null)}
              className="text-claimondo-navy/40 hover:text-claimondo-navy ml-0.5"
              aria-label="Fall-Bezug entfernen"
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-ios-md px-2.5 py-1 text-[11px] transition-colors ${
              selectedFall
                ? 'bg-claimondo-navy/10 text-claimondo-navy hover:bg-claimondo-navy/15'
                : 'bg-claimondo-bg text-claimondo-ondo hover:bg-claimondo-ondo/10'
            }`}
            aria-label="Fall-Bezug wählen"
          >
            <FileTextIcon className="w-3.5 h-3.5" />
            <span>{selectedFall ? 'Fall-Bezug ändern' : 'Fall-Bezug wählen'}</span>
          </button>
          {pickerOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-ios-xl border border-claimondo-border shadow-claimondo-md overflow-hidden z-10">
              <button
                type="button"
                onClick={() => {
                  setSelectedFallId(null)
                  setPickerOpen(false)
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-claimondo-bg ${
                  selectedFallId === null ? 'bg-claimondo-navy/5 font-semibold' : ''
                }`}
              >
                Allgemein (kein Fall-Bezug)
              </button>
              {fallOptions.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setSelectedFallId(f.id)
                    setPickerOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-claimondo-bg border-t border-claimondo-border/30 ${
                    selectedFallId === f.id ? 'bg-claimondo-navy/5 font-semibold' : ''
                  }`}
                >
                  {f.claim_nummer ?? f.id.slice(0, 8)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    ) : undefined

  return (
    <div className="flex flex-col h-full bg-transparent p-2 min-h-0">
      <div className="flex-1 min-h-0 glass-panel rounded-2xl overflow-hidden">
        <ChatThreadStream
          scope={scope}
          currentUserId={currentUserId}
          send={kundeSender}
          markRead={() => markKundeChatMessagesRead(kanal).then(() => {})}
          bubbleVariant="avatar"
          senderLabels={senderLabels}
          composerExtras={composerExtras}
          placeholder={placeholder}
          emptyHint="Noch keine Nachrichten. Schreib einfach was — dein Betreuer bekommt es direkt."
          sendKanal={kanal}
          sendFallId={selectedFallId}
          sendEmpfaengerId={partnerUserId}
        />
      </div>
    </div>
  )
}
