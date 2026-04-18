'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'

// AAR-474 C8: Leichtgewichtiger Combobox ohne cmdk/radix-popover.
// Deviation vom Ticket: statt shadcn Command/Popover native Input + gefilterte
// Liste — spart Dependencies, erfüllt dasselbe UX-Ziel (Autocomplete-Suche).

type Versicherer = { id: string; name: string }

type Props = {
  value: string | null
  onChange: (id: string | null) => void
  versicherer: Versicherer[]
  placeholder?: string
  ariaLabel?: string
  error?: boolean
}

export function VersichererSelect({
  value,
  onChange,
  versicherer,
  placeholder = 'Versicherung wählen …',
  ariaLabel,
  error,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => versicherer.find((v) => v.id === value) ?? null,
    [versicherer, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return versicherer.slice(0, 50)
    return versicherer.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 50)
  }, [versicherer, query])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const borderClass = error
    ? 'border-red-500 focus-within:border-red-500'
    : 'border-claimondo-border focus-within:border-claimondo-ondo'

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2 text-left transition hover:bg-slate-50 ${borderClass}`}
      >
        <span className={selected ? 'text-claimondo-navy' : 'text-slate-400'}>
          {selected?.name ?? placeholder}
        </span>
        <span className="flex items-center gap-1">
          {selected ? (
            <X
              className="h-4 w-4 cursor-pointer text-slate-400 hover:text-red-500"
              role="button"
              aria-label="Auswahl entfernen"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
                setQuery('')
              }}
            />
          ) : null}
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-claimondo-border bg-white shadow-lg">
          <div className="border-b border-claimondo-border px-3 py-2">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Versicherung suchen …"
              className="w-full bg-transparent text-sm text-claimondo-navy outline-none placeholder:text-slate-400"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">Nicht gefunden</li>
            ) : (
              filtered.map((v) => {
                const active = v.id === value
                return (
                  <li
                    key={v.id}
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(v.id)
                      setOpen(false)
                      setQuery('')
                    }}
                    className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-claimondo-bg ${
                      active ? 'bg-claimondo-bg text-claimondo-ondo' : 'text-claimondo-navy'
                    }`}
                  >
                    <span>{v.name}</span>
                    {active ? <Check className="h-4 w-4" /> : null}
                  </li>
                )
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
