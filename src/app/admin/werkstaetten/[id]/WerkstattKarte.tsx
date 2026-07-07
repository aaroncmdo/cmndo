'use client'

// Standortkarte als Mapbox-Static-Image (Marker + Isochrone) — kein client-mapbox-gl,
// nur ein <img>. Fallback auf Koordinaten-Text bei fehlendem Token/Standort/Ladefehler.

import { useState } from 'react'
import { baueWerkstattKartenUrl } from '@/lib/werkstatt/static-map-url'

export function WerkstattKarte({
  lat,
  lng,
  isochrone,
}: {
  lat: number | null
  lng: number | null
  isochrone: unknown
}) {
  const [fehler, setFehler] = useState(false)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  if (lat == null || lng == null) {
    return <p className="text-body-sm text-claimondo-ondo">Kein Standort hinterlegt.</p>
  }

  const url = baueWerkstattKartenUrl({ lat, lng, isochrone, token })
  if (!url || fehler) {
    return (
      <p className="text-body-sm text-claimondo-ondo">
        Karte nicht verfügbar. Koordinaten: {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Standort & 30-Minuten-Fahrgebiet der Werkstatt"
        className="w-full rounded-ios-md border border-claimondo-border"
        loading="lazy"
        onError={() => setFehler(true)}
      />
      <p className="text-body-xs text-claimondo-ondo">
        {isochrone ? 'Blau: 30-Minuten-Fahrgebiet (Isochrone).' : 'Kein Fahrgebiet berechnet.'} · Koordinaten:{' '}
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>
    </div>
  )
}
