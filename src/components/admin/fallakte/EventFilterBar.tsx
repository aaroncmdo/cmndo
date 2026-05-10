'use client'

// AAR-544 (C7): Filter-Bar für den unified Event-Stream im Timeline-Tab.
// Quellen-Checkboxen, Zeitraum-Select, Such-Input.

import { SearchIcon } from 'lucide-react'
import type { FallEventSource } from '@/lib/fall/event-stream'

const SOURCES: { id: FallEventSource; label: string; icon: string }[] = [
  { id: 'timeline', label: 'Timeline', icon: '📝' },
  { id: 'nachricht_system', label: 'System-Nachrichten', icon: '💬' },
  { id: 'mitteilung', label: 'Mitteilungen', icon: '🔔' },
  { id: 'webhook', label: 'Webhooks', icon: '🔌' },
  { id: 'task', label: 'Tasks', icon: '📋' },
  { id: 'dokument', label: 'Dokumente', icon: '📄' },
  { id: 'termin', label: 'Termine', icon: '📅' },
]

export type EventFilterState = {
  sources: Set<FallEventSource>
  zeitraum: 'alle' | '7d' | '30d' | '90d'
  search: string
}

export function defaultEventFilter(): EventFilterState {
  return {
    sources: new Set(SOURCES.map((s) => s.id)),
    zeitraum: 'alle',
    search: '',
  }
}

export function EventFilterBar({
  value,
  onChange,
  total,
  shown,
}: {
  value: EventFilterState
  onChange: (next: EventFilterState) => void
  total: number
  shown: number
}) {
  function toggleSource(id: FallEventSource) {
    const next = new Set(value.sources)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange({ ...value, sources: next })
  }

  return (
    <div className="glass-light border border-claimondo-border rounded-ios-md p-3 mb-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {SOURCES.map((s) => {
          const active = value.sources.has(s.id)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleSource(s.id)}
              className={`inline-flex items-center gap-1 text-xs font-medium rounded-full border px-2.5 py-1 transition-colors ${
                active
                  ? 'bg-claimondo-bg border-claimondo-ondo text-claimondo-navy'
                  : 'bg-white border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg'
              }`}
            >
              <span>{s.icon}</span>
              {s.label}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={value.zeitraum}
          onChange={(e) =>
            onChange({ ...value, zeitraum: e.target.value as EventFilterState['zeitraum'] })
          }
          className="text-xs border border-claimondo-border rounded-md px-2 py-1.5 bg-white text-claimondo-navy"
        >
          <option value="alle">Gesamter Zeitraum</option>
          <option value="7d">Letzte 7 Tage</option>
          <option value="30d">Letzte 30 Tage</option>
          <option value="90d">Letzte 90 Tage</option>
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-claimondo-ondo/70" />
          <input
            type="text"
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            placeholder="Suche in Titeln, Beschreibungen…"
            className="w-full text-xs border border-claimondo-border rounded-md pl-7 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/30"
          />
        </div>
        <span className="text-xs text-claimondo-ondo shrink-0">
          {shown} / {total}
        </span>
      </div>
    </div>
  )
}
