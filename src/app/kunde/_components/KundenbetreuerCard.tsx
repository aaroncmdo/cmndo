'use client'

// Kunde-Sidebar-Card: zeigt zugewiesenen Kundenbetreuer + Quick-Actions
// (Anrufen, Chat). Chat-Button öffnet ein right-side Slide-Out-Drawer
// im Glass-Design statt einer eigenen Page-Navigation — der Kunde kann
// in jedem Kontext kurz ein paar Worte schreiben, ohne die Seite zu wechseln.

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { PhoneIcon, MessageSquareIcon, VideoIcon, XIcon } from 'lucide-react'
import BeratungBuchenSheet from '@/components/kunde/BeratungBuchenSheet'

type Props = {
  vorname: string | null
  nachname: string | null
  telefon: string | null
  avatarUrl: string | null
  /** Iframe-Quelle für den Chat-Drawer (idR /kunde/chat?fall=<id>) */
  chatHref: string
  /** Akzent-Farbe (Brand-Primary mit Fallback) */
  accentBg: string
  /** Single-Fall-ID für die Videotermin-Buchung — null = Button versteckt */
  fallId: string | null
}

export default function KundenbetreuerCard({
  vorname,
  nachname,
  telefon,
  avatarUrl,
  chatHref,
  accentBg,
  fallId,
}: Props) {
  const [chatOpen, setChatOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

  // ESC schließt das Drawer
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
    <div className="mx-3 mb-3 rounded-xl bg-white/5 border border-white/10 p-3">
      <p className="text-[10px] uppercase tracking-wider text-[#7BA3CC] mb-2">
        Ihr Betreuer
      </p>
      <div className="flex items-center gap-2.5">
        <div
          className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold text-white shrink-0"
          style={{ backgroundColor: accentBg }}
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={name}
              width={40}
              height={40}
              className="w-full h-full object-cover"
              unoptimized
            />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{name}</p>
          <p className="text-[10px] text-[#7BA3CC]">Kundenbetreuer</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mt-3">
        {telefon ? (
          <a
            href={`tel:${telefon}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium py-2 transition-colors"
            aria-label={`${name} anrufen`}
          >
            <PhoneIcon className="w-3.5 h-3.5" />
            Anrufen
          </a>
        ) : (
          <span className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/5 text-[#7BA3CC]/60 text-xs py-2 cursor-not-allowed">
            <PhoneIcon className="w-3.5 h-3.5" />
            Anrufen
          </span>
        )}
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium py-2 transition-colors"
        >
          <MessageSquareIcon className="w-3.5 h-3.5" />
          Chat
        </button>
      </div>

      {/* Slide-Out-Drawer: Chat im Glass-Design, von rechts ausfahrend.
          Iframe rendert die bestehende Chat-Page (Cookies/Session werden
          mitgeschickt) — keine Logik-Duplikation. */}
      {chatOpen && (
        <>
          <div
            onClick={() => setChatOpen(false)}
            className="fixed inset-0 z-[1100] bg-claimondo-navy/40 backdrop-blur-md transition-opacity"
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Chat mit Ihrem Betreuer"
            className="fixed right-0 top-0 bottom-0 z-[1101] w-full sm:max-w-[440px] flex flex-col bg-white/85 backdrop-blur-xl border-l border-white/40 shadow-2xl animate-[slideInRight_240ms_ease-out]"
            style={{
              animationFillMode: 'forwards',
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-claimondo-border bg-white/60 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <MessageSquareIcon className="w-4 h-4 text-claimondo-navy" />
                <h2 className="text-sm font-semibold text-claimondo-navy">Chat</h2>
              </div>
              <div className="flex items-center gap-1.5">
                {fallId && (
                  <button
                    type="button"
                    onClick={() => setVideoOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-claimondo-navy hover:bg-claimondo-navy/90 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
                  >
                    <VideoIcon className="w-3.5 h-3.5" />
                    Videotermin
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
            <iframe
              src={chatHref}
              title="Chat"
              className="flex-1 w-full border-0 bg-transparent"
            />
          </div>
          <style jsx>{`
            @keyframes slideInRight {
              from {
                transform: translateX(100%);
              }
              to {
                transform: translateX(0);
              }
            }
          `}</style>
        </>
      )}

      {/* Videotermin-Buchung — separates Modal, ueber dem Chat-Drawer */}
      {fallId && (
        <BeratungBuchenSheet
          fallId={fallId}
          open={videoOpen}
          onClose={() => setVideoOpen(false)}
        />
      )}
    </div>
  )
}
