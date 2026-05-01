'use client'

// Kunde-Sidebar-Card fuer den zugewiesenen Sachverstaendigen.
// Chat oeffnet ein Gruppenchat-Modal — Kunde + SV chatten direkt, der KB
// liest mit (kanal='gruppenchat') und kann jederzeit eingreifen.
// Pin-Pattern + Glass-Modal sind identisch zur KundenbetreuerCard.

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { PhoneIcon, MessageSquareIcon, XIcon } from 'lucide-react'
import KundeKbChat from './KundeKbChat'
import { useActiveContactStore } from './useActiveContactStore'

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
  /** Eskalierter Admin (zusaetzlicher Sender im Gruppenchat) */
  adminUserId?: string | null
  adminName?: string | null
  adminAvatarUrl?: string | null
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
  adminUserId,
  adminName,
  adminAvatarUrl,
  fallOptions,
}: Props) {
  const active = useActiveContactStore((s) => s.active)
  const setActive = useActiveContactStore((s) => s.setActive)
  const chatOpen = active === 'sv'
  const setChatOpen = (open: boolean) => setActive(open ? 'sv' : null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardRect, setCardRect] = useState<{ top: number; bottom: number; right: number } | null>(null)

  useEffect(() => {
    if (!chatOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setChatOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    const measure = () => {
      const r = cardRef.current?.getBoundingClientRect()
      if (r) setCardRect({ top: r.top, bottom: r.bottom, right: r.right })
    }
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

  const name = [vorname, nachname].filter(Boolean).join(' ') || 'Ihr Gutachter'
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
          if (currentUserId && svUserId) setChatOpen(true)
        }}
        disabled={!currentUserId || !svUserId}
        className="w-full px-3 py-2.5 text-left flex flex-col gap-1.5 disabled:cursor-not-allowed"
        aria-label={`Chat mit ${name} öffnen`}
      >
        <p
          className={`text-[9px] uppercase tracking-wider leading-tight ${
            chatOpen ? 'text-claimondo-ondo' : 'text-[#7BA3CC]'
          }`}
        >
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
              Sachverständiger
            </p>
          </div>
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
            className="absolute md:left-64 md:ml-3 left-3 right-3 bottom-3 md:right-auto md:w-[400px] h-[min(640px,calc(100vh-2rem))] flex flex-col gap-2 animate-[popFromCard_240ms_cubic-bezier(0.2,0.9,0.3,1.2)]"
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
            {/* Header-Card: gestackte Avatare aller Teilnehmer + Gruppenchat-Titel */}
            <div className="px-2 pt-2 shrink-0">
              <div className="glass-panel rounded-2xl px-3 py-2.5 flex items-center gap-2.5">
                {(() => {
                  type Participant = { name: string; avatar: string | null; bg: string }
                  const teilnehmer: Participant[] = [
                    { name, avatar: avatarUrl, bg: accentBg },
                  ]
                  if (kbUserId && kbName) {
                    teilnehmer.push({ name: kbName, avatar: kbAvatarUrl ?? null, bg: '#4573A2' })
                  }
                  if (adminUserId && adminName) {
                    teilnehmer.push({ name: adminName, avatar: adminAvatarUrl ?? null, bg: '#F59E0B' })
                  }
                  const namen = teilnehmer.map((p) => p.name.split(' ')[0]).join(', ')
                  return (
                    <>
                      <div className="flex -space-x-2 shrink-0">
                        {teilnehmer.slice(0, 4).map((p, idx) => {
                          const ini =
                            p.name
                              .split(' ')
                              .map((w) => w[0])
                              .filter(Boolean)
                              .slice(0, 2)
                              .join('')
                              .toUpperCase() || '?'
                          return (
                            <div
                              key={idx}
                              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white border-2 border-white/85"
                              style={{ backgroundColor: p.bg, zIndex: teilnehmer.length - idx }}
                            >
                              {p.avatar ? (
                                <Image
                                  src={p.avatar}
                                  alt={p.name}
                                  width={36}
                                  height={36}
                                  className="w-full h-full object-cover"
                                  unoptimized
                                />
                              ) : (
                                ini
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-claimondo-navy leading-tight">Gruppenchat</p>
                        <p className="text-[10px] text-claimondo-ondo leading-tight mt-0.5 truncate">
                          mit {namen}
                        </p>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <KundeKbChat
                currentUserId={currentUserId}
                partnerUserId={svUserId}
                additionalSenderIds={[
                  ...(kbUserId ? [kbUserId] : []),
                  ...(adminUserId ? [adminUserId] : []),
                ]}
                kanal="gruppenchat"
                fallOptions={fallOptions}
                defaultFallId={fallId}
                placeholder="Nachricht an Gutachter (Betreuer im CC) …"
                senderLabels={{
                  [svUserId]: { name, rolle: 'sv', avatarUrl },
                  ...(kbUserId && kbName
                    ? { [kbUserId]: { name: kbName, rolle: 'kb' as const, avatarUrl: kbAvatarUrl ?? null } }
                    : {}),
                  ...(adminUserId && adminName
                    ? { [adminUserId]: { name: adminName, rolle: 'kb' as const, avatarUrl: adminAvatarUrl ?? null } }
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
