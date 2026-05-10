'use client'

// AAR-805: Shared-Spotlight — Cmd+K Quick-Search-Modal.
//
// Macht das Chrome wiederverwendbar (Listener, Open/Close, Debounce,
// Pfeil-Navigation, Render-Layout). Pro Portal liefert ein Wrapper:
//   - searchEndpoint:  GET ?q=... → JSON
//   - parseResponse:   wandelt Server-Response in Gruppen
//   - navigate:        callback pro Treffer
//
// Beispiel siehe components/Spotlight.tsx (Admin) und
// app/gutachter/_components/SVSpotlight.tsx (Gutachter).

import { useState, useEffect, useRef, useCallback } from 'react'
import { type LucideIcon, SearchIcon } from 'lucide-react'

export type SpotlightResult = {
  id: string
  label: string
  sub?: string
  status?: string
}

export type SpotlightGroup = {
  /** Eindeutiger Key — z.B. 'faelle', 'leads', 'sv'. */
  key: string
  /** Sektions-Label im Header der Gruppe. */
  label: string
  /** Lucide-Icon links neben jedem Treffer. */
  icon: LucideIcon
  /** Tailwind-Klasse für Icon-Color, z.B. 'text-[#4573A2]'. */
  iconColor?: string
  /** Tailwind-Klasse für Hover/Selected-Hintergrund, z.B. 'hover:bg-amber-50'. */
  hoverBg?: string
  /** Treffer in dieser Gruppe. */
  results: SpotlightResult[]
}

type Props = {
  /** Endpoint, der `?q=<query>` als GET-Param erwartet und JSON liefert. */
  searchEndpoint: string
  /** Wandelt die JSON-Antwort in Gruppen um. */
  parseResponse: (data: unknown) => SpotlightGroup[]
  /** Wird mit Gruppen-Key + Treffer-ID aufgerufen, schließt das Modal. */
  navigate: (groupKey: string, id: string) => void
  /** Placeholder im Such-Input. Default „Suche…". */
  placeholder?: string
  /** a11y-Label. Default „Spotlight-Suche". */
  ariaLabel?: string
}

export function Spotlight({
  searchEndpoint,
  parseResponse,
  navigate,
  placeholder = 'Suche…',
  ariaLabel = 'Spotlight-Suche',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<SpotlightGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cmd+K / Ctrl+K Listener.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Auf Open: Reset + Fokus.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      setQuery('')
      setGroups([])
      setSelectedIdx(0)
    }
  }, [open])

  const search = useCallback(
    (q: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (q.length < 2) {
        setGroups([])
        return
      }
      setLoading(true)
      timerRef.current = setTimeout(async () => {
        try {
          const r = await fetch(`${searchEndpoint}?q=${encodeURIComponent(q)}`)
          if (r.ok) {
            const data = await r.json()
            setGroups(parseResponse(data))
            setSelectedIdx(0)
          }
        } catch {
          /* Network-Fehler → leere Liste */
        }
        setLoading(false)
      }, 250)
    },
    [searchEndpoint, parseResponse],
  )

  // Flatten für globale Pfeil-Navigation.
  const flat = groups.flatMap((g) => g.results.map((r) => ({ groupKey: g.key, item: r })))
  const hasResults = flat.length > 0

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, flat.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && flat[selectedIdx]) {
      e.preventDefault()
      const sel = flat[selectedIdx]
      setOpen(false)
      navigate(sel.groupKey, sel.item.id)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-claimondo-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-claimondo-border">
          <SearchIcon className="w-5 h-5 text-claimondo-ondo/70 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              search(e.target.value)
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 text-sm text-claimondo-navy placeholder-gray-400 outline-none bg-transparent"
          />
          <kbd className="text-[10px] text-claimondo-ondo/70 bg-[#f8f9fb] px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Loading */}
        {loading && <div className="px-4 py-3 text-claimondo-ondo/70 text-xs">Suche…</div>}

        {/* Results */}
        {!loading && hasResults && (
          <div className="max-h-80 overflow-y-auto">
            {(() => {
              let runningIdx = 0
              return groups
                .filter((g) => g.results.length > 0)
                .map((g) => {
                  const Icon = g.icon
                  const iconColor = g.iconColor ?? 'text-claimondo-ondo'
                  const hoverBg = g.hoverBg ?? 'hover:bg-[#f8f9fb]'
                  const selectedBg = hoverBg.replace('hover:', '')
                  return (
                    <div key={g.key}>
                      <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-claimondo-ondo/70 uppercase tracking-wider">
                        {g.label}
                      </p>
                      {g.results.map((r) => {
                        const myIdx = runningIdx++
                        const isSelected = selectedIdx === myIdx
                        return (
                          <button
                            key={r.id}
                            onClick={() => {
                              setOpen(false)
                              navigate(g.key, r.id)
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2 text-left ${hoverBg} transition-colors ${
                              isSelected ? selectedBg : ''
                            }`}
                          >
                            <Icon className={`w-4 h-4 ${iconColor} shrink-0`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-claimondo-navy truncate">{r.label}</p>
                              {r.sub && (
                                <p className="text-[10px] text-claimondo-ondo/70 truncate">{r.sub}</p>
                              )}
                            </div>
                            {r.status && (
                              <span className="text-[10px] text-claimondo-ondo/70 bg-[#f8f9fb] px-1.5 py-0.5 rounded shrink-0">
                                {r.status}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })
            })()}
          </div>
        )}

        {!loading && query.length >= 2 && !hasResults && (
          <div className="px-4 py-6 text-center text-claimondo-ondo/70 text-sm">Keine Ergebnisse</div>
        )}

        {!loading && query.length < 2 && (
          <div className="px-4 py-4 text-center text-claimondo-ondo/70 text-xs">
            Mindestens 2 Zeichen eingeben ·{' '}
            <kbd className="bg-[#f8f9fb] px-1 py-0.5 rounded font-mono">Cmd+K</kbd>
          </div>
        )}
      </div>
    </div>
  )
}
