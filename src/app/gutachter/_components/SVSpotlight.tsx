'use client'

// AAR-804: Cmd+K Spotlight-Suche für SVs über die eigenen Fälle.
// Suche nach Kennzeichen, Fall-Nummer, Kunden-Name oder Schadensort.
// Im Gegensatz zum Admin-Spotlight nur faelle (keine Leads/SVs sichtbar
// für SV-Rolle). Mounted im GutachterShell.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SearchIcon, FileTextIcon } from 'lucide-react'

type Result = { id: string; label: string; sub: string; status?: string }

export default function SVSpotlight() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cmd+K / Ctrl+K Listener
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

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      setQuery('')
      setResults([])
      setSelectedIdx(0)
    }
  }, [open])

  const search = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/gutachter/search?q=${encodeURIComponent(q)}`)
        if (r.ok) {
          const data = await r.json()
          setResults(data.faelle ?? [])
          setSelectedIdx(0)
        }
      } catch {
        /* ignore — Network-Fehler wird durch leere Liste reflektiert */
      }
      setLoading(false)
    }, 250)
  }, [])

  function navigate(id: string) {
    setOpen(false)
    router.push(`/gutachter/fall/${id}`)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault()
      navigate(results[selectedIdx].id)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Akten-Suche"
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
            placeholder="Kennzeichen, Fall-Nr, Kunde oder Ort…"
            className="flex-1 text-sm text-claimondo-navy placeholder-gray-400 outline-none bg-transparent"
          />
          <kbd className="text-[10px] text-claimondo-ondo/70 bg-[#f8f9fb] px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        {loading && <div className="px-4 py-3 text-claimondo-ondo/70 text-xs">Suche…</div>}

        {!loading && results.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-claimondo-ondo/70 uppercase tracking-wider">
              Meine Fälle
            </p>
            {results.map((r, i) => (
              <button
                key={r.id}
                onClick={() => navigate(r.id)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-[var(--brand-secondary,#4573A2)]/5 transition-colors ${
                  selectedIdx === i ? 'bg-[var(--brand-secondary,#4573A2)]/5' : ''
                }`}
              >
                <FileTextIcon className="w-4 h-4 text-[var(--brand-secondary,#4573A2)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-claimondo-navy truncate">{r.label}</p>
                  {r.sub && <p className="text-[10px] text-claimondo-ondo/70 truncate">{r.sub}</p>}
                </div>
                {r.status && (
                  <span className="text-[10px] text-claimondo-ondo/70 bg-[#f8f9fb] px-1.5 py-0.5 rounded shrink-0">
                    {r.status}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {!loading && query.length >= 2 && results.length === 0 && (
          <div className="px-4 py-6 text-center text-claimondo-ondo/70 text-sm">Keine Fälle gefunden</div>
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
