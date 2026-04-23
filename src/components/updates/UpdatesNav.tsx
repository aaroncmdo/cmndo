'use client'

// AAR-725: Globale Updates-Nav. Ersetzt MitteilungszentralePanel /
// NotificationBell in allen 6 Portalen außer Kunde.
//
// Zustände:
//   - leer → grauer Button
//   - offen → navy gefüllt + Counter
//   - kritisch (>=1 prioritaet='dringend' offen) → rot gefüllt + Counter
// Realtime-INSERT → 1× kurzes Aufleuchten.
//
// Click-Toggle: öffnet/schließt Popover mit 4 Tabs
// (Aktivität / Nachrichten / Anrufe / Kritisch). Outside-Click + ESC +
// Navigation schließen. Task-Kategorie ist deprecated (AAR-723 Pill).

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BellIcon,
  AlertTriangleIcon,
  MessageCircleIcon,
  ActivityIcon,
  PhoneIcon,
  CheckIcon,
  XIcon,
} from 'lucide-react'
import { useMitteilungen } from '@/components/mitteilungszentrale/useMitteilungen'
import type { Mitteilung, MitteilungKategorie } from '@/lib/mitteilungen/types'

type Variant = 'dark' | 'light'
type TabKey = 'aktivitaet' | 'nachrichten' | 'anrufe' | 'kritisch'

const TABS: { key: TabKey; label: string; icon: typeof BellIcon }[] = [
  { key: 'aktivitaet', label: 'Aktivität', icon: ActivityIcon },
  { key: 'nachrichten', label: 'Nachrichten', icon: MessageCircleIcon },
  { key: 'anrufe', label: 'Anrufe', icon: PhoneIcon },
  { key: 'kritisch', label: 'Kritisch', icon: AlertTriangleIcon },
]

function fmtRelative(iso: string) {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'jetzt'
  if (diffMin < 60) return `vor ${diffMin} Min`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `vor ${h} Std`
  const days = Math.floor(h / 24)
  if (days < 7) return `vor ${days} Tg`
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export default function UpdatesNav({ variant = 'dark' }: { variant?: Variant }) {
  const { items, markAsRead } = useMitteilungen()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('aktivitaet')
  const [flashing, setFlashing] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  // AAR-725: Previous unread-count um Flash nur bei ECHTEM Zuwachs für DIESEN
  // User zu triggern. `lastInsertTick` des Hooks schlägt auch bei fremden
  // Inserts aus — davor schütz die Diff-Logik hier.
  const prevUnreadRef = useRef<number | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  // AAR-725: „task"-Kategorie ist deprecated (AAR-723 Pill). Alles andere
  // wird angezeigt.
  const relevant = useMemo(
    () => items.filter(m => m.kategorie !== ('task' as MitteilungKategorie)),
    [items],
  )
  const unreadRelevant = useMemo(() => relevant.filter(m => !m.gelesen), [relevant])
  const unreadTotal = unreadRelevant.length
  const kritischUnread = useMemo(
    () => unreadRelevant.filter(m => m.prioritaet === 'dringend'),
    [unreadRelevant],
  )
  const hasKritisch = kritischUnread.length > 0

  // Flash nur wenn der Unread-Count für diesen User GESTIEGEN ist — nicht
  // bei initialem Mount (prevUnreadRef === null) und nicht wenn ein fremder
  // mitteilungen-INSERT nur unseren Counter-Tick hochgezogen hat ohne Effekt
  // auf uns.
  useEffect(() => {
    const current = unreadTotal
    if (prevUnreadRef.current !== null && current > prevUnreadRef.current) {
      setFlashing(true)
      const t = setTimeout(() => setFlashing(false), 1000)
      prevUnreadRef.current = current
      return () => clearTimeout(t)
    }
    prevUnreadRef.current = current
  }, [unreadTotal])

  // AAR-725: Auto-Close bei Navigation.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Outside-Click + ESC.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (popoverRef.current?.contains(t) || buttonRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (activeTab === 'kritisch') return relevant.filter(m => m.prioritaet === 'dringend')
    const mapping: Record<Exclude<TabKey, 'kritisch'>, MitteilungKategorie> = {
      aktivitaet: 'update',
      nachrichten: 'nachricht',
      anrufe: 'anruf',
    }
    return relevant.filter(m => m.kategorie === mapping[activeTab as Exclude<TabKey, 'kritisch'>])
  }, [relevant, activeTab])

  const tabCount = (key: TabKey): number => {
    if (key === 'kritisch') return kritischUnread.length
    const mapping: Record<Exclude<TabKey, 'kritisch'>, MitteilungKategorie> = {
      aktivitaet: 'update',
      nachrichten: 'nachricht',
      anrufe: 'anruf',
    }
    return unreadRelevant.filter(m => m.kategorie === mapping[key as Exclude<TabKey, 'kritisch'>]).length
  }

  async function jumpTo(m: Mitteilung) {
    if (!m.gelesen) await markAsRead(m.id)
    setOpen(false)
    if (m.route_url) router.push(m.route_url)
  }

  // Button-Farben
  let buttonClass = ''
  if (hasKritisch) {
    buttonClass = 'bg-red-500 hover:bg-red-600 text-white'
  } else if (unreadTotal > 0) {
    buttonClass = variant === 'dark'
      ? 'bg-[#1E3A5F] hover:bg-[#2A4570] text-white'
      : 'bg-[#0D1B3E] hover:bg-[#1E3A5F] text-white'
  } else {
    buttonClass = variant === 'dark'
      ? 'bg-white/10 hover:bg-white/20 text-white/80'
      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
  }

  const flashClass = flashing
    ? hasKritisch
      ? 'ring-4 ring-red-400/60 animate-pulse'
      : 'ring-4 ring-[#7BA3CC]/60 animate-pulse'
    : ''

  return (
    <div className="relative">
      {/* AAR-725: Backdrop-blur auf Main-Content wenn Popover offen. */}
      {open && (
        <div
          className="fixed inset-0 z-30 backdrop-blur-sm bg-black/10 pointer-events-none"
          aria-hidden
        />
      )}

      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadTotal > 0 ? `Updates (${unreadTotal} neu)` : 'Updates'}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${buttonClass} ${flashClass}`}
      >
        <BellIcon className="w-3.5 h-3.5" />
        <span>Updates</span>
        {unreadTotal > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-white/95 text-red-600">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            role="dialog"
            aria-label="Updates"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute right-0 mt-2 w-[360px] max-w-[92vw] glass-light rounded-ios-lg shadow-ios-lg z-40 overflow-hidden"
          >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/40">
            <h2 className="text-sm font-semibold text-[#0D1B3E]">Updates</h2>
            <button
              onClick={() => setOpen(false)}
              className="p-1 -mr-1 text-gray-500 hover:text-gray-800"
              aria-label="Schließen"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="flex border-b border-gray-100">
            {TABS.map(t => {
              const c = tabCount(t.key)
              const active = activeTab === t.key
              const isKritisch = t.key === 'kritisch'
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium transition-colors ${
                    active
                      ? isKritisch
                        ? 'text-red-600 border-b-2 border-red-500 bg-red-50/30'
                        : 'text-[#0D1B3E] border-b-2 border-[#4573A2] bg-[#4573A2]/5'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <t.icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                    {c > 0 && (
                      <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold ${
                        isKritisch ? 'bg-red-500 text-white' : 'bg-[#4573A2] text-white'
                      }`}>
                        {c > 99 ? '99+' : c}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <BellIcon className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-400">Keine Einträge in dieser Kategorie</p>
              </div>
            ) : (
              filtered.map(m => (
                <div
                  key={m.id}
                  className={`border-b border-gray-50 px-4 py-3 transition-colors ${
                    m.gelesen ? 'bg-white' : 'bg-[#4573A2]/5'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base shrink-0">{m.icon ?? '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => jumpTo(m)}
                          className="text-left flex-1 min-w-0"
                        >
                          <p className={`text-xs leading-snug ${m.gelesen ? 'text-gray-600' : 'text-gray-900 font-semibold'} truncate`}>
                            {m.prioritaet === 'dringend' && (
                              <span className="inline-block mr-1 text-red-500" aria-label="Kritisch">●</span>
                            )}
                            {m.titel}
                          </p>
                          {m.inhalt && (
                            <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">{m.inhalt}</p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1">{fmtRelative(m.created_at)}</p>
                        </button>
                        {!m.gelesen && (
                          <button
                            onClick={() => markAsRead(m.id)}
                            className="shrink-0 p-1 text-gray-400 hover:text-green-600"
                            aria-label="Als gelesen markieren"
                            title="Als gelesen markieren"
                          >
                            <CheckIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
