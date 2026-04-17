'use client'

// AAR-381: Roter „JETZT"-Balken auf dem Tageskalender-Rail.
// Re-rendered alle 60 Sekunden via setInterval.

import { useEffect, useState } from 'react'

export interface JetztBalkenProps {
  /** Start-Stunde des Rails (z. B. 7). */
  startHour: number
  /** End-Stunde des Rails (exklusiv — z. B. 20 für 7:00-20:00). */
  endHour: number
  /** Gesamthöhe des Rails in Pixeln. */
  railHeightPx: number
}

function currentOffsetRatio(startHour: number, endHour: number): number | null {
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = startHour * 60
  const endMinutes = endHour * 60
  if (nowMinutes < startMinutes || nowMinutes >= endMinutes) return null
  return (nowMinutes - startMinutes) / (endMinutes - startMinutes)
}

export default function JetztBalken({
  startHour,
  endHour,
  railHeightPx,
}: JetztBalkenProps) {
  const [ratio, setRatio] = useState<number | null>(() =>
    currentOffsetRatio(startHour, endHour),
  )

  useEffect(() => {
    const tick = () => setRatio(currentOffsetRatio(startHour, endHour))
    tick()
    const handle = setInterval(tick, 60_000)
    return () => clearInterval(handle)
  }, [startHour, endHour])

  if (ratio === null) return null

  const topPx = Math.round(ratio * railHeightPx)

  return (
    <div
      className="absolute left-0 right-0 z-20 pointer-events-none"
      style={{ top: `${topPx}px` }}
      aria-label="Aktuelle Uhrzeit"
    >
      <div className="relative h-[2px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]">
        <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
        <span className="absolute right-0 -top-4 text-[9px] font-semibold tracking-wider text-red-500 uppercase bg-white px-1 rounded">
          Jetzt
        </span>
      </div>
    </div>
  )
}
