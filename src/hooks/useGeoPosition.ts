'use client'

// CMM-36: Startet watchPosition sobald der SV die App öffnet und schreibt
// die Position per Upsert in sv_live_location. Kein ETA — das macht
// useGeoTracking in der Fallakte. Läuft den ganzen Tag solange die App offen ist.

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useGeoPosition(svId: string | null) {
  const watchIdRef = useRef<number | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!svId || typeof navigator === 'undefined' || !navigator.geolocation) return

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        await supabase.from('sv_live_location').upsert(
          {
            sv_id: svId,
            fall_id: null,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'sv_id' },
        )
      },
      (err) => console.warn('[CMM-36] GPS-Fehler:', err.message),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [svId]) // eslint-disable-line react-hooks/exhaustive-deps
}
