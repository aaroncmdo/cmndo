'use client'

// AAR-544 (C7): Render-Component für den unified Event-Stream.
// Gruppiert Events nach Datum, zeigt Source-Icons + Severity-Farben und
// öffnet das EventDetailModal bei Klick.

import { useMemo, useState } from 'react'
import {
  FileTextIcon,
  MessageSquareIcon,
  BellIcon,
  ZapIcon,
  CheckCircleIcon,
  CalendarIcon,
  ClockIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
} from 'lucide-react'
import type { FallEvent, FallEventSource, FallEventSeverity } from '@/lib/fall/event-stream'
import {
  EventFilterBar,
  defaultEventFilter,
  type EventFilterState,
} from './EventFilterBar'
import { EventDetailModal } from './EventDetailModal'

const SOURCE_ICON: Record<FallEventSource, typeof FileTextIcon> = {
  timeline: ClockIcon,
  nachricht_system: MessageSquareIcon,
  mitteilung: BellIcon,
  webhook: ZapIcon,
  task: CheckCircleIcon,
  dokument: FileTextIcon,
  termin: CalendarIcon,
}

const ICON_BY_NAME: Record<string, typeof FileTextIcon> = {
  'file-text': FileTextIcon,
  'message-square': MessageSquareIcon,
  bell: BellIcon,
  zap: ZapIcon,
  'check-circle': CheckCircleIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  'alert-triangle': AlertTriangleIcon,
  'arrow-right': ArrowRightIcon,
}

const SEVERITY_COLOR: Record<FallEventSeverity, string> = {
  info: 'text-gray-500 bg-gray-100',
  success: 'text-emerald-700 bg-emerald-50',
  warning: 'text-amber-700 bg-amber-50',
  error: 'text-red-700 bg-red-50',
}

function pickIcon(e: FallEvent): typeof FileTextIcon {
  if (e.icon && ICON_BY_NAME[e.icon]) return ICON_BY_NAME[e.icon]
  return SOURCE_ICON[e.source] ?? ClockIcon
}

function fmtDateHeader(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function dateKey(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 10)
}

const PAGE_SIZE = 50

export function EventTimeline({ events }: { events: FallEvent[] }) {
  const [filter, setFilter] = useState<EventFilterState>(defaultEventFilter())
  const [selected, setSelected] = useState<FallEvent | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const now = Date.now()
    const cutoffMs: Record<EventFilterState['zeitraum'], number> = {
      alle: 0,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
    }
    const ms = cutoffMs[filter.zeitraum]
    const s = filter.search.trim().toLowerCase()
    return events.filter((e) => {
      if (!filter.sources.has(e.source)) return false
      if (ms > 0) {
        const t = new Date(e.timestamp).getTime()
        if (isNaN(t) || now - t > ms) return false
      }
      if (s) {
        const hit =
          e.titel.toLowerCase().includes(s) ||
          (e.beschreibung ?? '').toLowerCase().includes(s) ||
          e.typ.toLowerCase().includes(s) ||
          (e.actor?.name ?? '').toLowerCase().includes(s)
        if (!hit) return false
      }
      return true
    })
  }, [events, filter])

  const visible = filtered.slice(0, limit)

  const grouped = useMemo(() => {
    const g = new Map<string, FallEvent[]>()
    for (const ev of visible) {
      const k = dateKey(ev.timestamp)
      const arr = g.get(k) ?? []
      arr.push(ev)
      g.set(k, arr)
    }
    return Array.from(g.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [visible])

  return (
    <div>
      <EventFilterBar
        value={filter}
        onChange={(next) => {
          setFilter(next)
          setLimit(PAGE_SIZE)
        }}
        total={events.length}
        shown={filtered.length}
      />

      {filtered.length === 0 ? (
        <div className="glass-light border border-claimondo-border rounded-ios-md p-6 text-center">
          <p className="text-sm text-gray-500">Keine Events für den gewählten Filter.</p>
        </div>
      ) : (
        <div className="glass-light border border-claimondo-border rounded-ios-md">
          {grouped.map(([day, dayEvents], i) => (
            <div key={day} className={i > 0 ? 'border-t border-claimondo-border' : ''}>
              <div className="sticky top-0 bg-claimondo-bg border-b border-claimondo-border px-4 py-2 text-xs font-semibold text-claimondo-navy uppercase tracking-wider">
                {fmtDateHeader(day + 'T12:00:00Z')}
              </div>
              <ul>
                {dayEvents.map((ev) => {
                  const Icon = pickIcon(ev)
                  return (
                    <li
                      key={ev.id}
                      className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50/70 border-b border-claimondo-border last:border-b-0 cursor-pointer"
                      onClick={() => setSelected(ev)}
                    >
                      <span
                        className={`flex-shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center ${SEVERITY_COLOR[ev.severity]}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-xs font-mono text-gray-400 shrink-0">
                            {fmtTime(ev.timestamp)}
                          </span>
                          <span className="text-sm text-claimondo-navy font-medium">{ev.titel}</span>
                        </div>
                        {ev.beschreibung && (
                          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                            {ev.beschreibung}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400">
                          <span className="uppercase tracking-wider">{ev.source}</span>
                          {ev.actor?.name && <span>· {ev.actor.name}</span>}
                          {ev.actor?.rolle && !ev.actor?.name && <span>· {ev.actor.rolle}</span>}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          {filtered.length > limit && (
            <div className="p-3 border-t border-claimondo-border text-center">
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                className="text-xs font-medium text-claimondo-ondo hover:underline"
              >
                {filtered.length - limit} weitere Events laden
              </button>
            </div>
          )}
        </div>
      )}

      <EventDetailModal event={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
