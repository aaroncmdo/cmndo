'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, addMonths, subMonths, isSameMonth, isSameDay, isToday, isBefore,
  startOfDay,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ClipboardListIcon } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

type FallTermin = {
  id: string
  fall_nummer: string | null
  sv_termin: string
  sv_id: string | null
  status: string
}

type TaskTermin = {
  id: string
  fall_id: string | null
  titel: string
  faellig_am: string
  status: string
}

type CalendarEntry = {
  id: string
  date: Date
  label: string
  sublabel: string | null
  type: 'sv-termin' | 'task'
  href: string
  overdue: boolean
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function KalenderClient({
  faelle,
  tasks,
  svMap,
  fallMap,
}: {
  faelle: FallTermin[]
  tasks: TaskTermin[]
  svMap: Record<string, string>
  fallMap: Record<string, string>
}) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')

  // Build entries
  const entries = useMemo<CalendarEntry[]>(() => {
    const items: CalendarEntry[] = []
    const now = startOfDay(new Date())

    for (const f of faelle) {
      items.push({
        id: `sv-${f.id}`,
        date: new Date(f.sv_termin),
        label: f.fall_nummer ?? f.id.slice(0, 8),
        sublabel: f.sv_id ? svMap[f.sv_id] ?? null : null,
        type: 'sv-termin',
        href: `/admin/faelle/${f.id}`,
        overdue: isBefore(new Date(f.sv_termin), now) && f.status !== 'abgeschlossen',
      })
    }

    for (const t of tasks) {
      items.push({
        id: `task-${t.id}`,
        date: new Date(t.faellig_am),
        label: t.titel,
        sublabel: t.fall_id ? fallMap[t.fall_id] ?? null : null,
        type: 'task',
        href: '/admin/tasks',
        overdue: isBefore(new Date(t.faellig_am), now) && t.status !== 'erledigt',
      })
    }

    return items
  }, [faelle, tasks, svMap, fallMap])

  // Calculate calendar days
  const calendarDays = useMemo(() => {
    if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
      return eachDayOfInterval({ start: weekStart, end: weekEnd })
    }
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentDate, viewMode])

  function getEntriesForDay(day: Date) {
    return entries.filter(e => isSameDay(e.date, day))
  }

  function navigate(dir: 'prev' | 'next') {
    if (viewMode === 'month') {
      setCurrentDate(dir === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    } else {
      const days = dir === 'next' ? 7 : -7
      setCurrentDate(new Date(currentDate.getTime() + days * 86400000))
    }
  }

  const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

  return (
    <div className="px-4 py-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-white">Kalender</h1>
            <p className="text-zinc-500 text-sm mt-0.5">SV-Termine & Task-Fälligkeiten</p>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'month' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Monat
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'week' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Woche
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate('prev')}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Heute
              </button>
              <button
                onClick={() => navigate('next')}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>

            <span className="text-white text-sm font-medium ml-2">
              {format(currentDate, viewMode === 'month' ? 'MMMM yyyy' : "'KW' w, MMMM yyyy", { locale: de })}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-zinc-400 text-xs">SV-Termin</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span className="text-zinc-400 text-xs">Task</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-zinc-400 text-xs">Überfällig</span>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-zinc-800">
            {WEEKDAYS.map(d => (
              <div key={d} className="px-2 py-2.5 text-center text-zinc-500 text-xs font-medium">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className={`grid grid-cols-7 ${viewMode === 'week' ? '' : 'auto-rows-fr'}`}>
            {calendarDays.map((day, i) => {
              const dayEntries = getEntriesForDay(day)
              const isCurrentMonth = isSameMonth(day, currentDate)
              const today = isToday(day)

              return (
                <div
                  key={i}
                  className={`border-b border-r border-zinc-800/50 p-1.5 ${
                    viewMode === 'week' ? 'min-h-48' : 'min-h-24'
                  } ${!isCurrentMonth && viewMode === 'month' ? 'bg-zinc-950/50' : ''}`}
                >
                  <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    today ? 'bg-blue-600 text-white' : isCurrentMonth ? 'text-zinc-300' : 'text-zinc-700'
                  }`}>
                    {format(day, 'd')}
                  </div>

                  <div className="space-y-0.5">
                    {dayEntries.slice(0, viewMode === 'week' ? 10 : 3).map(entry => (
                      <Link
                        key={entry.id}
                        href={entry.href}
                        className={`block px-1.5 py-0.5 rounded text-[10px] leading-tight truncate transition-colors ${
                          entry.overdue
                            ? 'bg-red-950/80 text-red-300 hover:bg-red-900/80'
                            : entry.type === 'sv-termin'
                              ? 'bg-blue-950/80 text-blue-300 hover:bg-blue-900/80'
                              : 'bg-orange-950/80 text-orange-300 hover:bg-orange-900/80'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          {entry.type === 'sv-termin'
                            ? <CalendarIcon className="w-2.5 h-2.5 flex-shrink-0" />
                            : <ClipboardListIcon className="w-2.5 h-2.5 flex-shrink-0" />
                          }
                          <span className="truncate">{entry.label}</span>
                        </div>
                        {entry.sublabel && viewMode === 'week' && (
                          <span className="text-[9px] opacity-70 truncate block ml-3.5">{entry.sublabel}</span>
                        )}
                      </Link>
                    ))}
                    {dayEntries.length > (viewMode === 'week' ? 10 : 3) && (
                      <span className="text-zinc-600 text-[10px] px-1.5">
                        +{dayEntries.length - (viewMode === 'week' ? 10 : 3)} mehr
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
