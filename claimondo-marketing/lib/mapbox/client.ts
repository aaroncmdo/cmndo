'use client'

// AAR-380: Client-Side Mapbox-GL Singleton + Token-Setup.
//
// WICHTIG: Nur der Public-Token (pk.) darf ins Browser-Bundle — der
// Secret-Token (sk., `MAPBOX_ACCESS_TOKEN`) bleibt server-only für
// Isochrone/Matrix/Directions.

import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

let initialized = false

/**
 * Setzt den Public-Mapbox-Token. Idempotent — darf mehrfach aufgerufen
 * werden. Wirft NICHT wenn Token fehlt, sondern loggt nur eine Warnung
 * (damit der Build grün bleibt wenn NEXT_PUBLIC_MAPBOX_TOKEN noch nicht
 * gesetzt ist).
 */
export function ensureMapboxInitialized(): boolean {
  if (initialized) return true
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) {
    console.warn(
      '[mapbox] NEXT_PUBLIC_MAPBOX_TOKEN fehlt — Karte wird nicht initialisiert',
    )
    return false
  }
  mapboxgl.accessToken = token
  initialized = true
  return true
}

export { mapboxgl }
