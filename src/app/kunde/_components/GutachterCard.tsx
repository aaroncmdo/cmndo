'use client'

// Kunde-Sidebar-Card fuer den zugewiesenen Sachverstaendigen.
// Chat oeffnet ein Gruppenchat-Modal — Kunde + SV chatten direkt, der KB
// liest mit (kanal='gruppenchat') und kann jederzeit eingreifen.
// Pin-Pattern + Glass-Modal sind identisch zur KundenbetreuerCard.

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { PhoneIcon, MessageSquareIcon, XIcon } from 'lucide-react'
import KundeKbChat from './KundeKbChat'

type Props = {
  vorname: string | null
  nachname: string | null
  telefon: string | null
  avatarUrl: string | null
  /** Akzent-Farbe der Sidebar (Brand-Primary mit Fallback) */
  accentBg: string
  /** Single-Fall-ID — Default-Fall im Fall-Bezug-Picker */
  fallId: string | null
  /** Kunde-User-ID */
  currentUserId: string | null
  /** SV-User-ID (profile_id) — Empfaenger des gruppenchat-Inserts */
  svUserId: string | null
  /** KB-User-ID — als zusaetzlicher Sender im Realtime-Filter (KB liest mit) */
  kbUserId: string | null
  /** KB-Anzeigename — fuer Bubble-Label im Gruppenchat */
  kbName?: string | null
  /** KB-Avatar — fuer Mini-Avatar neben KB-Bubbles im Gruppenchat */
  kbAvatarUrl?: string | null
  /** Alle Faelle des Kunden — fuer Fall-Bezug-Picker */
  fallOptions: Array<{ id: string; fall_nummer: string | null }>
}

export default function GutachterCard({
  vorname,
  nachname,
  telefon,
  avatarUrl,
  accentBg,
  fallId,
  currentUserId,
  svUserId,
  kbUserId,
  kbName,
  kbAvatarUrl,
  fallOptions,
}: Props) {
  const [chatOpen, setChatOpen] = useState(false)

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

  const name = [vorname, nachname].filter(Boolean).join(' ') || 'Ihr Gutachter'
  const initials =
    [vorname?.[0], nachname?.[0]].filter(Boolean).join('').toUpperCase() || '?'

  return (
    <div
      className={`mb-2 ml-3 transition-all duration-200 relative ${
        chatOpen
          ? 'z-[1102] mr-0 rounded-l-xl rounded-r-none bg-white/15 border border-white/40 border-r-0 shadow-lg pr-3'
          : 'mr-3 rounded-xl border bg-white/[0.04] border-white/10 hover:bg-white/10'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (currentUserId && svUserId) setChatOpen(true)
        }}
        disabled={!currentUserId || !svUserId}
        className="w-full px-3 py-2.5 text-left flex flex-col gap-1.5 disabled:cursor-not-allowed"
        aria-label={`Chat mit ${name} öffnen`}
      >
        <p className="text-[9px] uppercase tracking-wider text-[#7BA3CC] leading-tight">
          Ihr Gutachter
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
          <p className="text-sm font-semibold text-white truncate leading-tight flex-1">{name}</p>
        </div>
      </button>

      {chatOpen && currentUserId && svUserId && (
        <div role="dialog" aria-modal="true" aria-label="Gruppenchat" className="fixed inset-0 z-[1100]">
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
                    <Image src={avatarUrl} alt={name} width={32} height={32} className="w-full h-full object-cover" unoptimized />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-claimondo-navy truncate">{name}</p>
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
                  <p className="text-[10px] text-claimondo-ondo">Mit Ihrem Betreuer im CC</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Chat schließen"
                className="text-claimondo-ondo hover:text-claimondo-navy p-1.5 rounded-lg hover:bg-white/60 transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <KundeKbChat
                currentUserId={currentUserId}
                partnerUserId={svUserId}
                additionalSenderIds={kbUserId ? [kbUserId] : []}
                kanal="gruppenchat"
                fallOptions={fallOptions}
                defaultFallId={fallId}
                placeholder="Nachricht an Gutachter (Betreuer im CC) …"
                senderLabels={{
                  [svUserId]: { name, rolle: 'sv', avatarUrl },
                  ...(kbUserId && kbName
                    ? { [kbUserId]: { name: kbName, rolle: 'kb' as const, avatarUrl: kbAvatarUrl ?? null } }
                    : {}),
                }}
              />
            </div>
          </div>
          <style jsx>{`
            @keyframes popFromCard {
              0% { opacity: 0; transform: scale(0.4) translateY(20px); }
              60% { opacity: 1; }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
