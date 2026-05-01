'use client'

// Kunde-Sidebar-Card: zeigt zugewiesenen Kundenbetreuer + Quick-Actions
// (Anrufen, Chat, Videotermin). Chat-Button öffnet ein zentriertes Glass-
// Modal mit reinem KB↔Kunde-Chat (Kanal 'chat_kb_kunde' — keine Tabs,
// kein /kunde/chat-Iframe). Videotermin-Button öffnet das BeratungBuchen-
// Sheet mit Google-Meet-Slot-Picker.

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { PhoneIcon, MessageSquareIcon, VideoIcon, XIcon } from 'lucide-react'
import BeratungBuchenSheet from '@/components/kunde/BeratungBuchenSheet'
import KundeKbChat from './KundeKbChat'

type Props = {
  vorname: string | null
  nachname: string | null
  telefon: string | null
  avatarUrl: string | null
  /** Akzent-Farbe (Brand-Primary mit Fallback) */
  accentBg: string
  /** Single-Fall-ID für Videotermin (Default-Fall im Chat-Picker) */
  fallId: string | null
  /** Kunde-User-ID (aktuell eingeloggter User) */
  currentUserId: string | null
  /** KB-User-ID — nötig für KundeKbChat (Realtime-Filter auf Sender-IDs) */
  kbUserId: string | null
  /** DB-Rolle des zugewiesenen Betreuers (kundenbetreuer | admin | …)
   *  fuer das Subline-Label */
  kbRolle?: string | null
  /** Eskalierter Admin (liest mit + chattet). User-ID + Name + Avatar */
  adminUserId?: string | null
  adminName?: string | null
  adminAvatarUrl?: string | null
  /** Alle Fälle des Kunden — für Fall-Bezug-Picker im Chat-Input */
  fallOptions: Array<{ id: string; fall_nummer: string | null }>
}

const ROLLE_LABEL: Record<string, string> = {
  kundenbetreuer: 'Kundenbetreuer',
  admin: 'Admin',
  dispatch: 'Dispatch',
}

export default function KundenbetreuerCard({
  vorname,
  nachname,
  telefon,
  avatarUrl,
  accentBg,
  fallId,
  currentUserId,
  kbUserId,
  kbRolle,
  adminUserId,
  adminName,
  adminAvatarUrl,
  fallOptions,
}: Props) {
  const rolleLabel = kbRolle && ROLLE_LABEL[kbRolle]
    ? ROLLE_LABEL[kbRolle]
    : 'Kundenbetreuer'
  const [chatOpen, setChatOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

  // Videotermin braucht einen Fall. Single-Fall: direkt nehmen. Multi-Fall:
  // ersten verfuegbaren als Default. Wenn ueberhaupt kein Fall existiert,
  // bleibt der Button versteckt.
  const effectiveBookingFallId = fallId ?? fallOptions[0]?.id ?? null

  // ESC schließt das Modal
  useEffect(() => {
    if (!chatOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setChatOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [chatOpen])

  const name = [vorname, nachname].filter(Boolean).join(' ') || 'Ihr Betreuer'
  const initials =
    [vorname?.[0], nachname?.[0]].filter(Boolean).join('').toUpperCase() || '?'

  return (
    <div
      className={`mb-2 ml-3 transition-all duration-200 relative z-[1102] ${
        chatOpen
          ? 'mr-0 rounded-l-xl rounded-r-none bg-white/85 backdrop-blur-xl border border-white/50 border-r-0 shadow-2xl pr-3'
          : 'mr-3 rounded-xl border bg-white/[0.04] border-white/10 hover:bg-white/10'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (currentUserId && kbUserId) setChatOpen(true)
        }}
        disabled={!currentUserId || !kbUserId}
        className="w-full px-3 py-2.5 text-left flex flex-col gap-1.5 disabled:cursor-not-allowed"
        aria-label={`Chat mit ${name} öffnen`}
      >
        <p
          className={`text-[9px] uppercase tracking-wider leading-tight ${
            chatOpen ? 'text-claimondo-ondo' : 'text-[#7BA3CC]'
          }`}
        >
          Ihr Betreuer
        </p>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ backgroundColor: accentBg }}
          >
            {avatarUrl ? (
              <Image src={avatarUrl} alt={name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-semibold truncate leading-tight ${
                chatOpen ? 'text-claimondo-navy' : 'text-white'
              }`}
            >
              {name}
            </p>
            <p
              className={`text-[10px] leading-tight mt-0.5 ${
                chatOpen ? 'text-claimondo-ondo' : 'text-[#7BA3CC]'
              }`}
            >
              {rolleLabel}
            </p>
          </div>
        </div>
      </button>

      {/* Glass-Modal: poppt aus der KB-Card heraus (Sidebar links unten),
          blurred Backdrop deckt den Rest. transform-origin bottom-left,
          damit das Modal sichtbar aus der Card "wächst". Chat ist NICHT
          fall-scoped — direkter KB-Kunde-Chat über alle Fälle. */}
      {chatOpen && currentUserId && kbUserId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chat mit Ihrem Betreuer"
          className="fixed inset-0 z-[1100]"
        >
          {/* Voll-Page-Backdrop mit Blur — die Sidebar wird mitgeblurrt
              (gewollt: das Modal soll sich klar abheben). Die Source-Card
              bleibt durch die hellere Hintergrundfarbe + Ring trotzdem
              erkennbar. */}
          <div
            onClick={() => setChatOpen(false)}
            className="absolute inset-0 bg-claimondo-navy/30 backdrop-blur-sm"
            aria-hidden="true"
          />
          <div
            className="absolute md:left-64 md:bottom-4 left-3 right-3 bottom-3 md:right-auto md:w-[400px] h-[min(640px,calc(100vh-2rem))] flex flex-col rounded-r-2xl rounded-l-none md:border-l-0 bg-white/85 backdrop-blur-xl border border-white/50 shadow-2xl overflow-hidden animate-[popFromCard_240ms_cubic-bezier(0.2,0.9,0.3,1.2)] max-md:rounded-2xl"
            style={{ transformOrigin: 'bottom left' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-claimondo-border/60 bg-white/60 backdrop-blur-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden"
                  style={{ backgroundColor: accentBg }}
                >
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt={name}
                      width={32}
                      height={32}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-claimondo-navy truncate">
                      {name}
                    </p>
                    {telefon && (
                      <a
                        href={`tel:${telefon}`}
                        className="shrink-0 w-6 h-6 rounded-full bg-claimondo-navy/10 hover:bg-claimondo-navy/20 text-claimondo-navy inline-flex items-center justify-center transition-colors"
                        aria-label={`${name} anrufen`}
                      >
                        <PhoneIcon className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-[10px] text-claimondo-ondo">Ihr Betreuer</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {effectiveBookingFallId && (
                  <button
                    type="button"
                    onClick={() => setVideoOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-claimondo-navy hover:bg-claimondo-navy/90 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
                  >
                    <VideoIcon className="w-3.5 h-3.5" />
                    Videotermin buchen
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  aria-label="Chat schließen"
                  className="text-claimondo-ondo hover:text-claimondo-navy p-1.5 rounded-lg hover:bg-white/60 transition-colors"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <KundeKbChat
                currentUserId={currentUserId}
                partnerUserId={kbUserId}
                additionalSenderIds={adminUserId ? [adminUserId] : []}
                kanal="chat_kb_kunde"
                fallOptions={fallOptions}
                defaultFallId={fallId}
                placeholder="Nachricht an deinen Betreuer …"
                senderLabels={{
                  [kbUserId]: { name, rolle: 'kb', avatarUrl },
                  ...(adminUserId && adminName
                    ? { [adminUserId]: { name: adminName, rolle: 'kb' as const, avatarUrl: adminAvatarUrl ?? null } }
                    : {}),
                }}
              />
            </div>
          </div>
          <style jsx>{`
            @keyframes popFromCard {
              0% {
                opacity: 0;
                transform: scale(0.4) translateY(20px);
              }
              60% {
                opacity: 1;
              }
              100% {
                opacity: 1;
                transform: scale(1) translateY(0);
              }
            }
          `}</style>
        </div>
      )}

      {/* Videotermin-Buchung — separates Modal, ueber dem Chat-Modal */}
      {effectiveBookingFallId && (
        <BeratungBuchenSheet
          fallId={effectiveBookingFallId}
          open={videoOpen}
          onClose={() => setVideoOpen(false)}
        />
      )}
    </div>
  )
}
