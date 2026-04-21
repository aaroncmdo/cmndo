'use client'

// AAR-384: Kunden-Side GPS-Tracking-Hook. Analog zu useFieldTracking,
// aber Token-basiert (unauthenticated) und ohne gps_outbox/sync — die
// Positions-Writes gehen direkt via Server-Action `updateKundePosition`.
// Debounce 15s (Kunde ist Beifahrer/Fahrer — seltener reicht). ETA-
// Recalc alle 60s, nicht jedes Update.

import { useEffect, useRef, useState } from 'react'
import { useWatchPosition } from '@/lib/gps/use-watch-position'
import { updateKundePosition } from './_actions'

const TRACK_INTERVAL_MS = 15_000
const ETA_RECALC_INTERVAL_MS = 60_000

export interface UseKundeLivePositionArgs {
  enabled: boolean
  token: string
  terminId: string
}

export interface KundeLivePositionState {
  position: { lat: number; lng: number } | null
  etaMinutes: number | null
  permissionState: 'pending' | 'granted' | 'denied'
  error: string | null
}

export function useKundeLivePosition({
  enabled,
  token,
  terminId,
}: UseKundeLivePositionArgs): KundeLivePositionState {
  const { position, error, permissionState } = useWatchPosition(enabled)
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null)
  const lastSentAtRef = useRef<number>(0)
  const lastEtaRecalcRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled || !position) return
    const now = Date.now()
    if (now - lastSentAtRef.current < TRACK_INTERVAL_MS) return
    lastSentAtRef.current = now
    const shouldRecalcEta = now - lastEtaRecalcRef.current > ETA_RECALC_INTERVAL_MS
    if (shouldRecalcEta) lastEtaRecalcRef.current = now
    ;(async () => {
      try {
        const res = await updateKundePosition(
          token,
          terminId,
          {
            lat: position.lat,
            lng: position.lng,
            accuracy_m: position.accuracy,
            speed_kmh: position.speed != null ? position.speed * 3.6 : null,
          },
          { recalculateEta: shouldRecalcEta },
        )
        if (res.success && res.etaMinutes != null) setEtaMinutes(res.etaMinutes)
      } catch (err) {
        console.error('[kunde-tracking] updateKundePosition:', err)
      }
    })()
  }, [enabled, position, token, terminId])

  return {
    position: position ? { lat: position.lat, lng: position.lng } : null,
    etaMinutes,
    permissionState,
    error,
  }
}
