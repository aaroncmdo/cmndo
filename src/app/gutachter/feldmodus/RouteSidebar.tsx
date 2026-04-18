'use client'

// AAR-382: Side-Panel im Fokus-Modus.
// Komponiert: Header + AktuellerStopCard + Liste der kommenden + erledigten
// Stops. Scrollt intern, Header bleibt sticky oben.

import type { SessionStatus } from '@/lib/types/field-modus'
import type { FeldmodusStop } from './page'
import AktuellerStopCard from './AktuellerStopCard'
import StopListItem from './StopListItem'
import FokusHeader from './FokusHeader'

export interface RouteSidebarProps {
  sessionId: string
  sessionStatus: SessionStatus
  stops: FeldmodusStop[]
  aktuellerStopIndex: number
  svPosition: { lat: number; lng: number } | null
  distanceMeters: number | null
  onAdvanced: (nextTerminId: string | null) => void
}

export default function RouteSidebar({
  sessionId,
  sessionStatus,
  stops,
  aktuellerStopIndex,
  svPosition,
  distanceMeters,
  onAdvanced,
}: RouteSidebarProps) {
  const aktuellerStop = stops[aktuellerStopIndex] ?? null
  const kommende = stops.slice(aktuellerStopIndex + 1)
  const erledigte = stops.slice(0, aktuellerStopIndex)

  return (
    <div className="flex flex-col h-full bg-[var(--brand-primary)]/95 backdrop-blur-md">
      <FokusHeader
        sessionId={sessionId}
        sessionStatus={sessionStatus}
        aktuellerIndex={aktuellerStopIndex}
        totalStops={stops.length}
        distanceMeters={distanceMeters}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {aktuellerStop ? (
          <AktuellerStopCard
            stop={aktuellerStop}
            sessionId={sessionId}
            sessionStatus={sessionStatus}
            svPosition={svPosition}
            onAdvanced={onAdvanced}
          />
        ) : (
          <div className="rounded-xl bg-white/10 p-4 text-sm text-gray-200">
            Kein aktiver Stop.
          </div>
        )}

        {kommende.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1">
              Kommende Stops ({kommende.length})
            </h3>
            <div className="space-y-1.5">
              {kommende.map((stop) => (
                <StopListItem
                  key={stop.termin_id}
                  stop={stop}
                  variant="kommend"
                />
              ))}
            </div>
          </section>
        )}

        {erledigte.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1">
              Erledigt ({erledigte.length})
            </h3>
            <div className="space-y-1.5">
              {erledigte.map((stop) => (
                <StopListItem
                  key={stop.termin_id}
                  stop={stop}
                  variant="erledigt"
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
