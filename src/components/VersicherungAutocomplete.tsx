'use client'

// AAR-265: Reusable Autocomplete für KFZ-Versicherer aus versicherungen-
// Stammdaten-Tabelle (95+ Einträge im Seed). Liefert UUID + denormalisierten
// Namen zurück, Freitext-Fallback erlaubt für seltene/unbekannte Versicherer.

import { useEffect, useRef, useState } from 'react'
import { searchVersicherungen, type VersicherungSuggestion } from '@/app/dispatch/leads/[id]/_actions/versicherungen'
import { CheckIcon, AlertTriangleIcon, LoaderIcon } from 'lucide-react'

export type VersicherungSelection = {
  id: string | null
  name: string
}

export default function VersicherungAutocomplete({
  initialName,
  initialId,
  onSelect,
  onFreitextConfirm,
  placeholder = 'Versicherung suchen ...',
  className,
  status,
}: {
  initialName?: string | null
  initialId?: string | null
  onSelect: (selection: VersicherungSelection) => void
  // Wird aufgerufen wenn der User Freitext bestätigt (Blur ohne Dropdown-Auswahl)
  // — id wird auf null gesetzt, name ist der Roh-Text.
  onFreitextConfirm?: (name: string) => void
  placeholder?: string
  className?: string
  status?: 'idle' | 'saving' | 'saved' | 'error'
}) {
  const [query, setQuery] = useState(initialName ?? '')
  const [suggestions, setSuggestions] = useState<VersicherungSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced Search 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      setLoading(false)
      return
    }
    // Wenn Query exakt dem ausgewählten Namen entspricht, nicht erneut suchen.
    if (selectedId && trimmed === (initialName ?? '').trim()) {
      setSuggestions([])
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const results = await searchVersicherungen(trimmed)
      setSuggestions(results)
      setLoading(false)
      setActiveIdx(0)
      setOpen(results.length > 0)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Outside-Click → Dropdown schließen
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function pick(s: VersicherungSuggestion) {
    setQuery(s.name)
    setSelectedId(s.id)
    setOpen(false)
    setSuggestions([])
    onSelect({ id: s.id, name: s.name })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function onBlur() {
    // 200ms Delay damit Click auf Suggestion noch durchkommt
    setTimeout(() => {
      const trimmed = query.trim()
      if (!trimmed) {
        if (selectedId !== null) {
          setSelectedId(null)
          onSelect({ id: null, name: '' })
        }
        return
      }
      // Wenn der User Freitext eingegeben hat (kein Dropdown-Item gewählt) und
      // der Text sich vom initialen Namen unterscheidet → Freitext-Bestätigung.
      if (!selectedId && trimmed !== (initialName ?? '').trim()) {
        onFreitextConfirm?.(trimmed)
      }
    }, 200)
  }

  const isFreitext = !selectedId && query.trim().length > 0

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            // Sobald der User editiert, wird die FK-Bindung aufgelöst.
            if (selectedId) setSelectedId(null)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={onBlur}
          placeholder={placeholder}
          className={`text-sm font-medium bg-transparent border-b w-full py-0.5 outline-none transition-colors ${
            status === 'saving'
              ? 'border-claimondo-ondo'
              : status === 'saved'
                ? 'border-green-300'
                : status === 'error'
                  ? 'border-red-300'
                  : selectedId
                    ? 'border-green-300'
                    : isFreitext
                      ? 'border-amber-300'
                      : 'border-claimondo-border hover:border-claimondo-border focus:border-[#4573A2]'
          }`}
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <LoaderIcon className="w-3 h-3 text-claimondo-ondo animate-spin" />}
          {!loading && selectedId && <CheckIcon className="w-3 h-3 text-green-500" />}
          {!loading && !selectedId && isFreitext && (
            <AlertTriangleIcon className="w-3 h-3 text-amber-500" />
          )}
        </div>
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-0.5 bg-white border border-claimondo-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-[#f8f9fb] ${
                i === activeIdx ? 'bg-[#f8f9fb]' : ''
              } ${i > 0 ? 'border-t border-claimondo-border' : ''}`}
            >
              <p className="font-medium text-claimondo-navy">{s.name}</p>
              {(s.schaden_telefon || s.schaden_email) && (
                <p className="text-[10px] text-claimondo-ondo mt-0.5">
                  {s.schaden_telefon && <span>📞 {s.schaden_telefon}</span>}
                  {s.schaden_telefon && s.schaden_email && <span> · </span>}
                  {s.schaden_email && <span>✉ {s.schaden_email}</span>}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {isFreitext && !open && (
        <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
          <AlertTriangleIcon className="w-3 h-3" />
          Nicht in Stammdaten — Kontaktdaten werden nicht auto-befüllt
        </p>
      )}
    </div>
  )
}
