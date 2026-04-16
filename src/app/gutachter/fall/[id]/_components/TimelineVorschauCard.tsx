'use client'

// AAR-289: Letzte 3 Timeline-Events als Kompakt-Karte. Volle Timeline im
// Akte-Drawer.

import { ClockIcon } from 'lucide-react'

type TimelineEvent = {
  id: string
  typ: string | null
  titel: string | null
  beschreibung: string | null
  created_at: string | null
}

export function TimelineVorschauCard({
  events,
}: {
  events: TimelineEvent[]
}) {
  const letzte = events.slice(0, 3)
  if (letzte.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Timeline
        </h3>
        <p className="text-xs text-gray-400 text-center py-2">Keine Events.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        Timeline · letzte {letzte.length}
      </h3>
      <ol className="space-y-3">
        {letzte.map((e) => (
          <li key={e.id} className="border-l-2 border-gray-200 pl-3 ml-1 relative">
            <span
              className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[#4573A2]"
              aria-hidden="true"
            />
            <p className="text-xs font-medium text-gray-900">{e.titel ?? e.typ ?? '—'}</p>
            {e.beschreibung && (
              <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2">
                {e.beschreibung}
              </p>
            )}
            {e.created_at && (
              <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />
                {new Date(e.created_at).toLocaleString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
