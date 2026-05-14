'use client'

// 2026-05-08 PR B2: Reroute-Toast für den Feldmodus.
//
// Erscheint oben in der Map wenn entweder
//   (a) eine alternative Route ≥ 2 min schneller ist (reason='faster')
//   (b) ein Hazard auf der primary-Polyline liegt (reason='hazard')
//
// UX-Pattern: Bottom-Sheet-artiger Banner an der Top-Edge mit zwei
// Buttons: „Übernehmen" (primary) / „Behalten" (secondary). Auto-Accept
// nach 10 s falls keine Reaktion. Countdown-Bar visualisiert den Auto-
// Accept damit der SV weiß was passieren wird wenn er nichts tut.

import { useEffect, useState } from 'react'
import { AlertTriangleIcon, ZapIcon } from 'lucide-react'
import type { ProposedReroute } from '@/lib/mapbox'
import { REROUTE_AUTO_ACCEPT_MS } from '@/lib/mapbox'

export interface RerouteToastProps {
  proposed: ProposedReroute
  onAccept: () => void
  onDismiss: () => void
}

export default function RerouteToast({ proposed, onAccept, onDismiss }: RerouteToastProps) {
  const [remaining, setRemaining] = useState(REROUTE_AUTO_ACCEPT_MS)

  useEffect(() => {
    const startedAt = Date.now()
    const tick = () => {
      const elapsed = Date.now() - startedAt
      const left = Math.max(0, REROUTE_AUTO_ACCEPT_MS - elapsed)
      setRemaining(left)
      if (left <= 0) onAccept()
    }
    const id = window.setInterval(tick, 100)
    return () => window.clearInterval(id)
  }, [onAccept])

  const progressPct = (remaining / REROUTE_AUTO_ACCEPT_MS) * 100

  const isHazard = proposed.reason === 'hazard'
  const headline = isHazard
    ? 'Hindernis voraus'
    : `Schnellere Route — ${Math.round(proposed.etaSavedSec / 60)} min sparen`
  const detail = isHazard
    ? proposed.hazardLabel ?? 'Unfall oder Sperrung auf der Strecke'
    : 'Wechseln auf staufreie Alternative?'
  const Icon = isHazard ? AlertTriangleIcon : ZapIcon
  const accentColor = isHazard ? '#DC2626' : '#1A73E8'

  return (
    <div
      role="alert"
      aria-live="polite"
      className="absolute top-4 left-4 right-4 z-30"
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className="rounded-2xl bg-white shadow-2xl shadow-black/30 overflow-hidden"
        style={{ borderTop: `4px solid ${accentColor}` }}
      >
        <div className="flex items-start gap-3 p-4">
          <div
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full"
            style={{ backgroundColor: `${accentColor}1A` }}
          >
            <Icon className="w-5 h-5" style={{ color: accentColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-claimondo-navy leading-tight">
              {headline}
            </p>
            <p className="text-xs text-claimondo-ondo mt-0.5 leading-snug">
              {detail}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 h-10 rounded-ios-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: accentColor }}
          >
            Übernehmen
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 h-10 rounded-ios-xl border border-claimondo-border text-claimondo-navy text-sm font-medium transition-colors hover:bg-claimondo-card"
          >
            Behalten
          </button>
        </div>
        <div
          className="h-1"
          style={{
            width: `${progressPct}%`,
            backgroundColor: accentColor,
            transition: 'width 100ms linear',
          }}
        />
      </div>
    </div>
  )
}
