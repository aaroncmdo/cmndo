'use client'

// AAR-381: Vertikaler Tageskalender-Rail mit Stunden-Linien + Termin-Cards.
// Ersetzt den alten Tagesverlauf+Heutige-Termine-Block als einzige Ansicht.

import { useMemo } from 'react'
import TerminCard from './TerminCard'
import JetztBalken from './JetztBalken'
import type { HeuteTerminFull } from './page'

export interface TageskalenderRailProps {
  termine: HeuteTerminFull[]
  /** Start-Stunde (default 7). */
  startHour?: number
  /** End-Stunde exklusiv (default 20 = 20:00). */
  endHour?: number
  /** Pixel pro Minute — default 2px. */
  pxPerMinute?: number
  svOrigin: { lat: number | null; lng: number | null } | null
}

function minutesOfDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

function durationMinutes(start: string, end: string | null | undefined): number {
  if (!end) return 60
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 60_000
  return Math.max(30, Math.round(diff))
}

export default function TageskalenderRail({
  termine,
  startHour = 7,
  endHour = 20,
  pxPerMinute = 2,
  svOrigin,
}: TageskalenderRailProps) {
  const totalMinutes = (endHour - startHour) * 60
  const railHeightPx = totalMinutes * pxPerMinute

  const hours = useMemo(() => {
    const arr: number[] = []
    for (let h = startHour; h <= endHour; h++) arr.push(h)
    return arr
  }, [startHour, endHour])

  const now = Date.now()

  return (
    <div
      className="relative ml-0"
      style={{ height: `${railHeightPx}px` }}
      role="list"
      aria-label="Tageskalender"
    >
      {/* Stunden-Linien + Labels */}
      {hours.map((h) => {
        const topPx = (h - startHour) * 60 * pxPerMinute
        return (
          <div
            key={h}
            className="absolute left-0 right-0 border-t border-claimondo-border"
            style={{ top: `${topPx}px` }}
          >
            <span className="absolute -top-2 left-0 text-[10px] font-medium text-claimondo-ondo/70 w-14 text-right pr-2">
              {String(h).padStart(2, '0')}:00
            </span>
          </div>
        )
      })}

      {/* JETZT-Linie */}
      <JetztBalken
        startHour={startHour}
        endHour={endHour}
        railHeightPx={railHeightPx}
      />

      {/* Termin-Cards */}
      {termine.map((t) => {
        const startMin = minutesOfDay(t.start_zeit)
        // Termine außerhalb der Rail-Zeitspanne clippen
        if (startMin < startHour * 60 || startMin >= endHour * 60) return null

        const topPx = (startMin - startHour * 60) * pxPerMinute
        const heightPx = Math.max(
          80,
          durationMinutes(t.start_zeit, t.end_zeit) * pxPerMinute,
        )
        const vergangen = t.end_zeit
          ? new Date(t.end_zeit).getTime() < now
          : new Date(t.start_zeit).getTime() < now - 60 * 60_000

        return (
          <TerminCard
            key={t.id}
            termin={t}
            topPx={topPx}
            heightPx={heightPx}
            svOrigin={svOrigin}
            vergangen={vergangen}
          />
        )
      })}
    </div>
  )
}
