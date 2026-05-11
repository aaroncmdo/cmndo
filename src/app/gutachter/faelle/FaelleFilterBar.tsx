'use client'

// AAR-409: Filter- + Such-Leiste für das SV-Fälle-Archiv. Schreibt alle
// Filter-Änderungen in die URL (router.replace, debounce für Text-Input),
// damit Bookmarks/Refresh-Verhalten konsistent bleibt.

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { SearchIcon, XIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

// AAR-370: Filter um zwei fallübergreifende Slices erweitert —
// „Mit offener Stellungnahme" (technische_stellungnahme_status='beauftragt')
// und „Mit offenen Tasks" (mind. 1 task mit status in (offen,in-bearbeitung)
// der diesem SV zugewiesen ist). Ersetzt den früheren separaten Sidebar-
// Einstieg /gutachter/tasks und die Fallakte-Tab-Suche.
type FilterKey =
  | 'alle'
  | 'neue'
  | 'bearbeitung'
  | 'gutachten'
  | 'abgeschlossen'
  | 'stellungnahme'
  | 'tasks'

const FILTER_TABS: [FilterKey, string][] = [
  ['alle', 'Alle'],
  ['neue', 'Neue'],
  ['bearbeitung', 'In Bearbeitung'],
  ['gutachten', 'Gutachten erstellt'],
  ['stellungnahme', 'Offene Stellungnahme'],
  ['tasks', 'Offene Tasks'],
  ['abgeschlossen', 'Abgeschlossen'],
]

export default function FaelleFilterBar({
  faelleCount,
  initialFilter,
  initialQuery,
}: {
  faelleCount: number
  initialFilter: FilterKey
  initialQuery: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [query, setQuery] = useState(initialQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Push Query in URL (debounced) ohne Full-Reload.
  useEffect(() => {
    if (query === initialQuery) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      if (query.trim()) {
        params.set('q', query.trim())
      } else {
        params.delete('q')
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`)
      })
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, initialQuery, pathname, router, searchParams])

  function setFilter(key: FilterKey) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (key === 'alle') {
      params.delete('filter')
    } else {
      params.set('filter', key)
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`)
    })
  }

  return (
    <div className="bg-white border-b border-claimondo-border px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <PageHeader
          title="Meine Fälle"
          description={`${faelleCount} ${faelleCount === 1 ? 'Fall' : 'Fälle'}`}
        />

        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-claimondo-ondo/70" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Fall-Nr, Kunde oder Ort"
            className="w-full pl-9 pr-8 py-3 rounded-[14px] border-[1.5px] border-transparent bg-claimondo-navy/[0.06] text-sm text-claimondo-navy tracking-[-.005em] placeholder:text-[#8a93a6] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-[0_0_0_4px_rgba(69,115,162,.12)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Suche löschen"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-claimondo-ondo/70 hover:text-claimondo-ondo"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {FILTER_TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-full text-xs font-semibold tracking-[-.005em] whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] ${
              initialFilter === key
                ? 'bg-[var(--brand-primary,#4573A2)] text-white shadow-[0_4px_12px_rgba(69,115,162,.30),0_1px_2px_rgba(69,115,162,.18)]'
                : 'bg-claimondo-navy/[0.06] text-claimondo-shield hover:bg-claimondo-navy/[0.10] hover:text-claimondo-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
