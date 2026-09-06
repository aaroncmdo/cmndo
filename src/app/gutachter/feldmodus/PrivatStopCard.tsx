'use client'

// 2026-07-08 (Aaron): Karte fuer einen Privat-Wegpunkt im Feldmodus (kind:'privat').
// Reiner Wegpunkt OHNE Besichtigung — kein Kunde-Tracking, keine Pflichtdoku, kein
// „Besichtigung abschliessen". Nur: wohin, wie weit, In-Maps-oeffnen + „Weiter zum
// naechsten Stop" (client-seitiger Advance; kein Server-/Termin-Seiteneffekt).

import { MapPinIcon, NavigationIcon, ArrowRightIcon, ClockIcon } from 'lucide-react'
import { formatUhrzeit } from '@/lib/format'
import type { FeldmodusStop } from './page'
import { Button } from '@/components/primitives/Button/Button.web'

export interface PrivatStopCardProps {
  stop: FeldmodusStop
  distanceMeters: number | null
  svInGeofence: boolean
  onWeiter: () => void
}

function formatDistanceShort(m: number | null): string | null {
  if (m == null) return null
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

function buildMapsLink(stop: FeldmodusStop): string {
  const base = 'https://www.google.com/maps/dir/?api=1'
  if (stop.place_id) {
    return `${base}&destination=${encodeURIComponent(stop.adresse)}&destination_place_id=${stop.place_id}`
  }
  if (stop.lat != null && stop.lng != null) {
    return `${base}&destination=${stop.lat},${stop.lng}`
  }
  return `${base}&destination=${encodeURIComponent(stop.adresse)}`
}

export default function PrivatStopCard({
  stop,
  distanceMeters,
  svInGeofence,
  onWeiter,
}: PrivatStopCardProps) {
  const distanceShort = formatDistanceShort(distanceMeters)

  return (
    <div className="rounded-ios-xl text-claimondo-navy p-4 space-y-3">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo">
            Privater Termin
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-claimondo-ondo">
            <ClockIcon className="w-3 h-3" />
            {formatUhrzeit(stop.start_zeit)}
          </span>
        </div>
        <p className="text-sm font-semibold text-claimondo-navy">{stop.kunde_name}</p>
      </div>

      <div className="flex items-start gap-2 text-sm text-claimondo-navy">
        <MapPinIcon className="w-4 h-4 text-claimondo-ondo mt-0.5" />
        <p className="flex-1">{stop.adresse}</p>
        {distanceShort && (
          <span className="text-xs font-semibold text-claimondo-ondo shrink-0">{distanceShort}</span>
        )}
      </div>

      <p className="text-[11px] text-claimondo-ondo">
        Wegpunkt aus Ihrem Kalender — keine Besichtigung.
      </p>

      <div className="flex flex-col gap-2 pt-1">
        <Button
          type="button"
          variant="navy"
          size="lg"
          fullWidth
          onClick={onWeiter}
          iconLeft={<ArrowRightIcon className="w-5 h-5" />}
        >
          {svInGeofence ? 'Angekommen — weiter zum nächsten Stop' : 'Überspringen — weiter'}
        </Button>
        <a
          href={buildMapsLink(stop)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-ios-lg border border-claimondo-border text-claimondo-navy text-sm font-medium min-h-12 px-4 hover:bg-claimondo-bg"
        >
          <NavigationIcon className="w-4 h-4" />
          In Google Maps öffnen
        </a>
      </div>
    </div>
  )
}
