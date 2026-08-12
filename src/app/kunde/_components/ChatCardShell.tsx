'use client'

// Geteilte Card-/Modal-Chrome der Kunde-Sidebar-Kontakt-Cards
// (KundenbetreuerCard + GutachterCard). Rendert die Trigger-Card (Avatar,
// Unread-Badge, Eyebrow, Name, Subline) und das Glass-Modal (Backdrop,
// positioniertes Panel, Close-Button, popFromCard-Animation). Die
// variantenspezifischen Teile - Modal-Header (Einzel-Avatar + Quick-Actions
// vs. gestapelte Teilnehmer) und der Chat selbst - kommen als Slots
// (modalHeader, children). Vorher war dieser Rahmen (inkl. der @keyframes
// popFromCard) in beiden Cards verbatim dupliziert.

import Image from 'next/image'
import { XIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type ChatCardShellProps = {
  /** Modal sichtbar. Der Caller loest die Bedingung auf (chatOpen && ids vorhanden). */
  open: boolean
  onOpen: () => void
  onClose: () => void
  /** Trigger deaktiviert (fehlende currentUserId/partnerUserId). */
  triggerDisabled: boolean
  eyebrow: string
  name: string
  initials: string
  avatarUrl: string | null
  accentBg: string
  unread: number
  subline: string
  /** Optionaler Zusatz unter der Subline (z.B. Google-Bewertung) - ohne Farbwechsel. */
  sublineExtra?: ReactNode
  triggerAriaLabel: string
  unreadAriaLabel: string
  modalAriaLabel: string
  closeAriaLabel: string
  /** Variant-Header innerhalb des glass-panel (Avatar(e) + Titel + optionale Actions). */
  modalHeader: ReactNode
  /** Der Chat (KundeKbChat) - nur gemountet solange das Modal offen ist. */
  children: ReactNode
}

export default function ChatCardShell({
  open,
  onOpen,
  onClose,
  triggerDisabled,
  eyebrow,
  name,
  initials,
  avatarUrl,
  accentBg,
  unread,
  subline,
  sublineExtra,
  triggerAriaLabel,
  unreadAriaLabel,
  modalAriaLabel,
  closeAriaLabel,
  modalHeader,
  children,
}: ChatCardShellProps) {
  return (
    <div className="mb-2 mx-3 rounded-ios-xl border bg-white/[0.04] border-white/10 hover:bg-white/10 transition-colors duration-200 relative z-[1102]">
      <button
        type="button"
        onClick={onOpen}
        disabled={triggerDisabled}
        className="w-full px-3 py-2.5 text-left flex flex-col gap-1.5 disabled:cursor-not-allowed"
        aria-label={triggerAriaLabel}
      >
        <p
          className={
            'text-[9px] uppercase tracking-wider leading-tight ' +
            (open ? 'text-claimondo-ondo' : 'text-claimondo-light-blue')
          }
        >
          {eyebrow}
        </p>
        <div className="flex items-center gap-2.5">
          <div className="relative shrink-0">
            <div
              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: accentBg }}
            >
              {avatarUrl ? (
                <Image src={avatarUrl} alt={name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
              ) : (
                initials
              )}
            </div>
            {unread > 0 && (
              <span
                className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold leading-none ring-2 ring-claimondo-navy"
                aria-label={unreadAriaLabel}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={
                'text-sm font-semibold truncate leading-tight ' +
                (open ? 'text-claimondo-navy' : 'text-white')
              }
            >
              {name}
            </p>
            <p
              className={
                'text-[10px] leading-tight mt-0.5 ' +
                (open ? 'text-claimondo-ondo' : 'text-claimondo-light-blue')
              }
            >
              {subline}
            </p>
            {sublineExtra}
          </div>
        </div>
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={modalAriaLabel} className="fixed inset-0 z-[1100]">
          <div
            onClick={onClose}
            className="absolute inset-0 bg-claimondo-navy/30 backdrop-blur-sm"
            aria-hidden="true"
          />
          <div
            className="absolute md:left-64 md:ml-3 left-3 right-3 bottom-3 md:right-auto md:w-[400px] h-[min(640px,calc(100vh-2rem))] flex flex-col gap-2 animate-[popFromCard_240ms_cubic-bezier(0.2,0.9,0.3,1.2)]"
            style={{
              transformOrigin: 'bottom left',
              ...(typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
                ? { top: 'calc(50vh - 320px)', bottom: 'auto' }
                : {}),
            }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label={closeAriaLabel}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/40 hover:bg-white/60 text-claimondo-navy inline-flex items-center justify-center transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
            <div className="px-2 pt-2 shrink-0">
              {/* Ops-Test 11.08.: `glass-panel` existierte als CSS-Klasse NICHT (nirgends
                  definiert) — der Modal-Header hatte dadurch keine Flaeche. Werte =
                  GlassPanel-Variante 'prominent' (shared/GlassPanel.tsx). */}
              <div className="rounded-ios-md bg-white/75 backdrop-blur-xl border border-white/60 shadow-ios-lg px-3 py-2.5 flex items-center gap-2.5">{modalHeader}</div>
            </div>
            <div className="flex-1 min-h-0">{children}</div>
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
    </div>
  )
}
