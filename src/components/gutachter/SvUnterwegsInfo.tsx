'use client'

// CMM-36: Zeigt dem SV seinen Live-Tracking-Status unterhalb des Steppers.
// Erscheint nur wenn Tracking aktiv (isTracking=true). Zeigt Name, ETA und
// Ankunftszeit. Kein Upload, kein Eingriff — rein informativ.

import { NavigationIcon } from 'lucide-react'
import type { GeoTrackingState } from '@/hooks/useGeoTracking'

export function SvUnterwegsInfo({ tracking }: { tracking: GeoTrackingState }) {
  if (!tracking.isTracking) return null

  const ankunft = tracking.etaAnkunftzeit
    ? tracking.etaAnkunftzeit.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="rounded-2xl bg-claimondo-navy text-white px-4 py-3 flex items-center gap-3">
      <NavigationIcon className="w-4 h-4 shrink-0 text-[#7BA3CC]" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold">Sie sind unterwegs</span>
        {ankunft && (
          <span className="text-sm text-[#7BA3CC] ml-2">
            · Ankunft ca. {ankunft}
            {tracking.etaMinuten && ` (${tracking.etaMinuten} Min.)`}
          </span>
        )}
      </div>
    </div>
  )
}
