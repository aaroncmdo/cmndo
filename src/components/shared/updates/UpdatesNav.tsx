'use client'

// AAR-725 / #updates-rebuild Phase 3: Globale Updates-Nav.
// DB-getriebenes Modell (useUpdates): Badge = offene Action-Items; Popover trennt
// "Braucht dich" (Action) von "Verlauf" (Info) + Typ-Filter. "Alles gesehen" setzt
// NUR den Info-Read-Marker — Action-Items loesen sich ueber ihren DB-State auf.

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BellIcon,
  ActivityIcon,
  MessageCircleIcon,
  PhoneIcon,
  ClipboardListIcon,
  CheckIcon,
  XIcon,
} from 'lucide-react'
import { useUpdates } from './useUpdates'
import { filterByTyp, type TypFilter } from '@/lib/updates/split'
import type { UpdateItem } from '@/lib/updates/types'
import { resolvePopoverPlacement, type PopoverPlacement } from './popover-placement'

type Variant = 'dark' | 'light'

const TYP_CHIPS: { key: TypFilter; label: string; icon: typeof BellIcon }[] = [
  { key: 'alle', label: 'Alle', icon: BellIcon },
  { key: 'event', label: 'Aktivität', icon: ActivityIcon },
  { key: 'message', label: 'Nachrichten', icon: MessageCircleIcon },
  { key: 'call', label: 'Anrufe', icon: PhoneIcon },
  { key: 'task', label: 'Aufgaben', icon: ClipboardListIcon },
]

function fmtRelative(iso: string) {
  const d = new Date(iso)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'jetzt'
  if (diffMin < 60) return `vor ${diffMin} Min`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `vor ${h} Std`
  const days = Math.floor(h / 24)
  if (days < 7) return `vor ${days} Tg`
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function typIcon(typ: UpdateItem['typ']): string {
  return typ === 'task' ? '✅' : typ === 'message' ? '💬' : typ === 'call' ? '📞' : '🔔'
}

export default function UpdatesNav({
  variant = 'dark',
  placement = 'down-left',
}: {
  variant?: Variant
  placement?: PopoverPlacement
}) {
  const { actionItems, infoItems, actionCount, newInfoCount, markSeen } = useUpdates()
  const [open, setOpen] = useState(false)
  const [typFilter, setTypFilter] = useState<TypFilter>('alle')
  const [showVerlauf, setShowVerlauf] = useState(false)
  const [flashing, setFlashing] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const prevActionRef = useRef<number | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  const hasKritisch = actionItems.some(i => i.prioritaet === 'dringend')

  // Flash nur bei ECHTEM Anstieg der offenen Action-Items.
  useEffect(() => {
    if (prevActionRef.current !== null && actionCount > prevActionRef.current) {
      setFlashing(true)
      const t = setTimeout(() => setFlashing(false), 1000)
      prevActionRef.current = actionCount
      return () => clearTimeout(t)
    }
    prevActionRef.current = actionCount
  }, [actionCount])

  // Auto-Close bei Navigation.
  useEffect(() => { setOpen(false) }, [pathname])

  // Outside-Click + ESC.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (popoverRef.current?.contains(t) || buttonRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filteredAction = useMemo(() => filterByTyp(actionItems, typFilter), [actionItems, typFilter])
  const filteredInfo = useMemo(() => filterByTyp(infoItems, typFilter), [infoItems, typFilter])

  function toggle() {
    const next = !open
    setOpen(next)
    // Beim Oeffnen Info als gesehen markieren (Action-Items bleiben unberuehrt).
    if (next && newInfoCount > 0) void markSeen()
  }

  function jumpTo(m: UpdateItem) {
    setOpen(false)
    if (m.routeUrl) router.push(m.routeUrl)
  }

  const { posClass: popoverPosClass, enterY: popoverEnterY } = resolvePopoverPlacement(placement)

  let buttonClass = ''
  if (hasKritisch) {
    buttonClass = 'bg-danger hover:bg-danger/90 text-white'
  } else if (actionCount > 0) {
    buttonClass = variant === 'dark'
      ? 'bg-claimondo-shield hover:bg-claimondo-navy text-white'
      : 'bg-claimondo-navy hover:bg-claimondo-shield text-white'
  } else {
    buttonClass = variant === 'dark'
      ? 'bg-white/10 hover:bg-white/20 text-white/80'
      : 'bg-claimondo-bg hover:bg-claimondo-border text-claimondo-navy'
  }

  const flashClass = flashing
    ? hasKritisch
      ? 'ring-4 ring-danger/60 animate-pulse'
      : 'ring-4 ring-claimondo-light-blue/60 animate-pulse'
    : ''

  return (
    <div className="relative">
      {open && (
        <div className="fixed inset-0 z-30 backdrop-blur-sm bg-black/10 pointer-events-none" aria-hidden />
      )}

      <button
        ref={buttonRef}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={actionCount > 0 ? `Updates (${actionCount} offen)` : 'Updates'}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${buttonClass} ${flashClass}`}
      >
        <BellIcon className="w-3.5 h-3.5" />
        <span>Updates</span>
        {actionCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-white/95 text-danger">
            {actionCount > 99 ? '99+' : actionCount}
          </span>
        )}
        {actionCount === 0 && newInfoCount > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-claimondo-light-blue" aria-label="Neue Aktivität" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            role="dialog"
            aria-label="Updates"
            initial={{ opacity: 0, scale: 0.96, y: popoverEnterY }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: popoverEnterY }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className={`absolute ${popoverPosClass} w-[360px] max-w-[92vw] glass-light rounded-ios-lg shadow-ios-lg z-40 overflow-hidden`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/40">
              <h2 className="text-sm font-semibold text-claimondo-navy">Updates</h2>
              <div className="flex items-center gap-2">
                {newInfoCount > 0 && (
                  <button
                    onClick={() => void markSeen()}
                    className="inline-flex items-center gap-1 text-[11px] text-claimondo-ondo hover:text-claimondo-navy"
                    title="Alles als gesehen markieren"
                  >
                    <CheckIcon className="w-3.5 h-3.5" /> Alles gesehen
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 -mr-1 text-claimondo-ondo hover:text-claimondo-navy"
                  aria-label="Schließen"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex gap-1 px-3 py-2 border-b border-claimondo-border overflow-x-auto">
              {TYP_CHIPS.map(c => {
                const active = typFilter === c.key
                return (
                  <button
                    key={c.key}
                    onClick={() => setTypFilter(c.key)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                      active ? 'bg-claimondo-navy text-white' : 'bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy'
                    }`}
                  >
                    <c.icon className="w-3 h-3" /> {c.label}
                  </button>
                )
              })}
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-danger">
                Braucht dich
              </div>
              {filteredAction.length === 0 ? (
                <div className="px-4 pb-3 text-xs text-claimondo-ondo/70">Nichts offen — alles erledigt. ✓</div>
              ) : (
                filteredAction.map(m => (
                  <button
                    key={`a-${m.id}`}
                    onClick={() => jumpTo(m)}
                    className="w-full text-left border-b border-claimondo-border px-4 py-2.5 hover:bg-claimondo-ondo/5 transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-base shrink-0">{typIcon(m.typ)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-snug text-claimondo-navy font-semibold truncate">
                          {m.prioritaet === 'dringend' && (
                            <span className="inline-block mr-1 text-danger" aria-label="Kritisch">●</span>
                          )}
                          {m.titel}
                        </p>
                        {m.inhalt && <p className="text-[11px] text-claimondo-ondo line-clamp-2 mt-0.5">{m.inhalt}</p>}
                        <p className="text-[10px] text-claimondo-ondo/70 mt-1">{fmtRelative(m.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}

              {filteredInfo.length > 0 && (
                <>
                  <button
                    onClick={() => setShowVerlauf(v => !v)}
                    className="w-full text-left px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-claimondo-ondo hover:text-claimondo-navy"
                  >
                    Verlauf ({filteredInfo.length}) {showVerlauf ? '▾' : '▸'}
                  </button>
                  {showVerlauf &&
                    filteredInfo.map(m => (
                      <button
                        key={`i-${m.id}`}
                        onClick={() => jumpTo(m)}
                        className="w-full text-left border-b border-claimondo-border px-4 py-2.5 bg-white hover:bg-claimondo-bg transition-colors"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-base shrink-0 opacity-70">{typIcon(m.typ)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs leading-snug text-claimondo-ondo truncate">{m.titel}</p>
                            {m.inhalt && <p className="text-[11px] text-claimondo-ondo/80 line-clamp-2 mt-0.5">{m.inhalt}</p>}
                            <p className="text-[10px] text-claimondo-ondo/60 mt-1">{fmtRelative(m.createdAt)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
