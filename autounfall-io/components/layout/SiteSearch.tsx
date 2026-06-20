'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface SearchItem {
  t: string
  u: string
}

// Header-Suche (Phase 1): clientseitiger Titel-/Slug-Filter ueber den statischen
// Index (/search-index.json), lazy beim ersten Fokus geladen. Volltext folgt
// spaeter. Layout-agnostisch — Platzierung steuert der GlobalHeader via `variant`.
export function SiteSearch({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<SearchItem[] | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function ensureIndex() {
    if (items) return
    try {
      const res = await fetch('/search-index.json')
      if (res.ok) setItems((await res.json()) as SearchItem[])
    } catch {
      /* offline/Build: Suche bleibt leer statt zu crashen */
    }
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const query = q.trim().toLowerCase()
  const results =
    query.length >= 2 && items
      ? items
          .filter((it) => it.t.toLowerCase().includes(query) || it.u.toLowerCase().includes(query))
          .slice(0, 8)
      : []
  const showPanel = open && query.length >= 2 && items != null

  const inputCls =
    variant === 'desktop'
      ? 'h-[42px] w-full rounded-full border border-au-sand-dark bg-au-surface pl-11 pr-4 text-[14.5px] text-au-ink placeholder:text-au-ink-faint focus:border-au-amber focus:outline-none focus:ring-2 focus:ring-au-amber-tint'
      : 'h-[46px] w-full rounded-xl border border-au-sand-dark bg-au-surface pl-11 pr-4 text-base text-au-ink placeholder:text-au-ink-faint focus:border-au-amber focus:outline-none focus:ring-2 focus:ring-au-amber-tint'

  return (
    <div ref={ref} className={variant === 'desktop' ? 'relative w-full max-w-[330px]' : 'relative'}>
      <label className="relative block">
        <span className="sr-only">Suche</span>
        <svg
          className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 stroke-au-ink-faint"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            ensureIndex()
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Thema, Versicherer oder Brief-Floskel suchen…"
          aria-label="Suche"
          className={inputCls}
        />
      </label>
      {showPanel ? (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-ios-md border border-au-sand-dark bg-au-surface shadow-au-lg">
          {results.length > 0 ? (
            <ul className="max-h-[60vh] overflow-auto py-1">
              {results.map((r) => (
                <li key={r.u}>
                  <Link
                    href={r.u}
                    onClick={() => {
                      setOpen(false)
                      setQ('')
                    }}
                    className="block px-4 py-2.5 text-sm text-au-ink-soft transition-colors hover:bg-au-paper-warm hover:text-au-amber"
                  >
                    {r.t}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-au-ink-faint">Keine Treffer für „{q}“.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
