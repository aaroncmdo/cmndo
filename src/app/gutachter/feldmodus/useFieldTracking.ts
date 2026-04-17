'use client'

// AAR-382 + AAR-388: Fokus-Modus Live-Tracking Hook.
// Schreibt GPS-Messungen IMMER zuerst in die lokale gps_outbox — der
// syncGpsOutbox-Worker entscheidet ob direkt an /api/sv/position-batch
// gesendet wird (online) oder auf Reconnect gewartet wird. So ist Online/
// Offline der gleiche Code-Pfad. Debounced auf 10s. Distanz-Berechnung
// (Haversine) + Geofence-Detection (< 100m für >= 30s) triggert
// `onGeofenceReached` genau einmal pro Target.

import { useEffect, useRef, useState } from 'react'
import { useWatchPosition } from '@/lib/gps/use-watch-position'
import { haversineMeters } from '@/lib/gps/geofence'
import { addGpsPosition } from '@/lib/offline/outbox'
import { syncGpsOutbox } from '@/lib/offline/sync-gps-outbox'

const TRACK_INTERVAL_MS = 10_000
const GEOFENCE_RADIUS_M = 100
const GEOFENCE_DURATION_MS = 30_000

export interface UseFieldTrackingArgs {
  enabled: boolean
  svId: string
  terminId: string | null
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
  svId,
  terminId,
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

  // AAR-388: Position debounced in die gps_outbox schreiben, dann Sync anstoßen.
  // Online/offline-Pfad ist identisch — der Sync-Worker entscheidet.
  useEffect(() => {
    if (!enabled || !position) return
    const now = Date.now()
    if (now - lastSentAtRef.current < TRACK_INTERVAL_MS) return
    lastSentAtRef.current = now
    ;(async () => {
      try {
        await addGpsPosition({
          sv_id: svId,
          termin_id: terminId,
          lat: position.lat,
          lng: position.lng,
          accuracy_m: position.accuracy,
          heading: position.heading,
          speed_kmh: position.speed != null ? position.speed * 3.6 : null,
          captured_at: Date.now(),
        })
        // Fire-and-forget: Sync-Versuch, wenn offline schlägt er silent fehl
        void syncGpsOutbox().catch(() => {})
      } catch (err) {
        console.error('[feldmodus] addGpsPosition:', err)
      }
    })()
  }, [enabled, svId, terminId, position])

  return {
    position: position
      ? { lat: position.lat, lng: position.lng, heading: position.heading }
      : null,
    distanceMeters: distance,
    permissionState,
    error,
  }
}
