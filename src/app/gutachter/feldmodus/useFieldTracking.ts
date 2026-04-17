'use client'

// AAR-382: Fokus-Modus Live-Tracking Hook.
// Debounced auf 10s: nimmt das aktuelle GPS-Signal aus useWatchPosition und
// persistiert es via writeLivePosition. Zusätzlich berechnet es die Distanz
// zum aktuellen Stop (Haversine) — wenn < 100m für >= 30s durchgehend, wird
// der `onGeofenceReached`-Callback aufgerufen (genau einmal, bis reset).

import { useEffect, useRef, useState } from 'react'
import { useWatchPosition } from '@/lib/gps/use-watch-position'
import { haversineMeters } from '@/lib/gps/geofence'
import { writeLivePosition } from './actions'

const TRACK_INTERVAL_MS = 10_000
const GEOFENCE_RADIUS_M = 100
const GEOFENCE_DURATION_MS = 30_000

export interface UseFieldTrackingArgs {
  enabled: boolean
  targetLat: number | null
  targetLng: number | null
  onGeofenceReached?: (pos: { lat: number; lng: number }) => void
}

export interface FieldTrackingState {
  position: { lat: number; lng: number; heading: number | null } | null
  distanceMeters: number | null
  permissionState: 'pending' | 'granted' | 'denied'
  error: string | null
}

export function useFieldTracking({
  enabled,
  targetLat,
  targetLng,
  onGeofenceReached,
}: UseFieldTrackingArgs): FieldTrackingState {
  const { position, error, permissionState } = useWatchPosition(enabled)
  const [distance, setDistance] = useState<number | null>(null)
  const lastSentAtRef = useRef<number>(0)
  const inGeofenceSinceRef = useRef<number | null>(null)
  const geofenceFiredRef = useRef(false)

  // Reset Geofence-Fired-Flag wenn Target wechselt
  useEffect(() => {
    geofenceFiredRef.current = false
    inGeofenceSinceRef.current = null
  }, [targetLat, targetLng])

  // Distanz berechnen + Geofence prüfen
  useEffect(() => {
    if (!position || targetLat == null || targetLng == null) {
      setDistance(null)
      return
    }
    const d = haversineMeters(position.lat, position.lng, targetLat, targetLng)
    setDistance(d)

    if (d < GEOFENCE_RADIUS_M) {
      const now = Date.now()
      if (inGeofenceSinceRef.current == null) {
        inGeofenceSinceRef.current = now
      } else if (
        !geofenceFiredRef.current &&
        now - inGeofenceSinceRef.current >= GEOFENCE_DURATION_MS
      ) {
        geofenceFiredRef.current = true
        onGeofenceReached?.({ lat: position.lat, lng: position.lng })
      }
    } else {
      inGeofenceSinceRef.current = null
    }
  }, [position, targetLat, targetLng, onGeofenceReached])

  // Position debounced auf den Server schreiben
  useEffect(() => {
    if (!enabled || !position) return
    const now = Date.now()
    if (now - lastSentAtRef.current < TRACK_INTERVAL_MS) return
    lastSentAtRef.current = now
    void writeLivePosition({
      lat: position.lat,
      lng: position.lng,
      accuracy_m: position.accuracy,
      heading: position.heading,
      speed_mps: position.speed,
    }).catch((err) => console.error('[feldmodus] writeLivePosition:', err))
  }, [enabled, position])

  return {
    position: position
      ? { lat: position.lat, lng: position.lng, heading: position.heading }
      : null,
    distanceMeters: distance,
    permissionState,
    error,
  }
}
