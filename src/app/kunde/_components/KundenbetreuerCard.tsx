'use client'

// Kunde-Sidebar-Card: zeigt zugewiesenen Kundenbetreuer + Quick-Actions
// (Anrufen, Chat, Videotermin). Chat-Button öffnet ein zentriertes Glass-
// Modal mit reinem KB↔Kunde-Chat (Kanal 'chat_kb_kunde' — keine Tabs,
// kein /kunde/chat-Iframe). Videotermin-Button öffnet das BeratungBuchen-
// Sheet mit Google-Meet-Slot-Picker.

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { PhoneIcon, MessageSquareIcon, VideoIcon, XIcon } from 'lucide-react'
import BeratungBuchenSheet from '@/components/kunde/BeratungBuchenSheet'
import KundeKbChat from './KundeKbChat'
import { useActiveContactStore } from './useActiveContactStore'

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
  const active = useActiveContactStore((s) => s.active)
  const setActive = useActiveContactStore((s) => s.setActive)
  const chatOpen = active === 'kb'
  const setChatOpen = (open: boolean) => setActive(open ? 'kb' : null)
  const [videoOpen, setVideoOpen] = useState(false)
  const [bookingKanal, setBookingKanal] = useState<'video' | 'telefon'>('video')
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardRect, setCardRect] = useState<{ top: number; bottom: number; right: number } | null>(null)


  // Videotermin braucht einen Fall. Single-Fall: direkt nehmen. Multi-Fall:
  // ersten verfuegbaren als Default. Wenn ueberhaupt kein Fall existiert,
  // bleibt der Button versteckt.
  const effectiveBookingFallId = fallId ?? fallOptions[0]?.id ?? null

  // ESC schließt das Modal + Sidebar in den Vordergrund (sonst legt sich
  // das Backdrop-Blur ueber die Cards). Aside hat normalerweise z-40 →
  // wir heben sie temporaer auf z-1102 ueber das Backdrop (z-1100).
  useEffect(() => {
    if (!chatOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setChatOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    const aside = document.querySelector('aside.kunde-sidebar') as HTMLElement | null
    let originalZ = ''
    if (aside) {
      originalZ = aside.style.zIndex
      aside.style.zIndex = '1102'
      aside.setAttribute('data-chat-open', 'true')
    }
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
      if (aside) {
        aside.style.zIndex = originalZ
        aside.removeAttribute('data-chat-open')
      }
    }
  }, [chatOpen])

  const name = [vorname, nachname].filter(Boolean).join(' ') || 'Ihr Betreuer'
  const initials =
    [vorname?.[0], nachname?.[0]].filter(Boolean).join('').toUpperCase() || '?'

  return (
    <div
      ref={cardRef}
      className="mb-2 mx-3 rounded-xl border bg-white/[0.04] border-white/10 hover:bg-white/10 transition-colors duration-200 relative z-[1102]"
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
            className="absolute md:left-64 md:ml-3 left-3 right-3 bottom-3 md:right-auto md:w-[400px] h-[min(640px,calc(100vh-2rem))] flex flex-col rounded-2xl glass-shell overflow-hidden animate-[popFromCard_240ms_cubic-bezier(0.2,0.9,0.3,1.2)]"
            style={{
              transformOrigin: 'bottom left',
              ...(typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
                ? {
                    top: `calc(50vh - 320px)`,
                    bottom: 'auto',
                  }
                : {}),
            }}
          >
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label="Chat schließen"
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/40 hover:bg-white/60 text-claimondo-navy inline-flex items-center justify-center transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
            {/* Header-Card: Avatar + Name + 2 Quick-Action-Kreise (Telefon=Rueckruf, Video=Videotermin) */}
            <div className="px-2 pt-2 shrink-0">
              <div className="glass-panel rounded-2xl px-3 py-2.5 flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden"
                  style={{ backgroundColor: accentBg }}
                >
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt={name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-claimondo-navy truncate leading-tight">{name}</p>
                  <p className="text-[10px] text-claimondo-ondo leading-tight mt-0.5">Ihr Betreuer</p>
                </div>
                {effectiveBookingFallId && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setBookingKanal('telefon')
                        setVideoOpen(true)
                      }}
                      className="shrink-0 w-9 h-9 rounded-full bg-claimondo-navy/10 hover:bg-claimondo-navy/20 text-claimondo-navy inline-flex items-center justify-center transition-colors"
                      aria-label="Rückruftermin buchen"
                      title="Rückruftermin buchen"
                    >
                      <PhoneIcon className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBookingKanal('video')
                        setVideoOpen(true)
                      }}
                      className="shrink-0 w-9 h-9 rounded-full bg-claimondo-navy/10 hover:bg-claimondo-navy/20 text-claimondo-navy inline-flex items-center justify-center transition-colors"
                      aria-label="Videotermin buchen"
                      title="Videotermin buchen"
                    >
                      <VideoIcon className="w-4 h-4" />
                    </button>
                  </>
                )}
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

      {/* Termin-Buchung (Video oder Telefon) — separates Modal, ueber dem Chat */}
      {effectiveBookingFallId && (
        <BeratungBuchenSheet
          fallId={effectiveBookingFallId}
          open={videoOpen}
          onClose={() => setVideoOpen(false)}
          defaultKanal={bookingKanal}
        />
      )}
    </div>
  )
}
