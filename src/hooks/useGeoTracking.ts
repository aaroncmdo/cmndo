'use client'

// CMM-36: Liest die Live-Position des SVs aus sv_live_location (Realtime)
// und berechnet ETA zur Schadens-Adresse via Mapbox. Wird in FallDetailClient
// verwendet. Die Position selbst schreibt useGeoPosition im Layout.

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { berechneEta } from '@/lib/mapbox/eta'

export type GeoTrackingState = {
  isTracking: boolean
  lat: number | null
  lng: number | null
  etaMinuten: number | null
  etaAnkunftzeit: Date | null
}

const ETA_REFRESH_INTERVALL_MS = 30_000

export function useGeoTracking(opts: {
  svId: string | null
  zielAdresse: string | null
}): GeoTrackingState {
  const { svId, zielAdresse } = opts

  const [state, setState] = useState<GeoTrackingState>({
    isTracking: false,
    lat: null,
    lng: null,
    etaMinuten: null,
    etaAnkunftzeit: null,
  })

  const etaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const letztePositionRef = useRef<{ lat: number; lng: number } | null>(null)
  const supabase = createClient()

  async function aktualisiereEta(lat: number, lng: number) {
    if (!zielAdresse) return
    const eta = await berechneEta(lat, lng, zielAdresse)
    if (eta) {
      setState((s) => ({ ...s, etaMinuten: eta.etaMinuten, etaAnkunftzeit: eta.etaAnkunftzeit }))
    }
  }

  useEffect(() => {
    if (!svId) return

    // Initialwert laden
    supabase
      .from('sv_live_location')
      .select('lat, lng, updated_at')
      .eq('sv_id', svId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const aktuell = Date.now() - new Date(data.updated_at as string).getTime() < 5 * 60 * 1000
        if (!aktuell) return
        const { lat, lng } = data as { lat: number; lng: number }
        letztePositionRef.current = { lat, lng }
        setState((s) => ({ ...s, isTracking: true, lat, lng }))
        aktualisiereEta(lat, lng)
      })

    // Realtime: neue Position → ETA neu berechnen
    const channel = supabase
      .channel(`geo-tracking-${svId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sv_live_location', filter: `sv_id=eq.${svId}` },
        (payload) => {
          const row = payload.new as { lat: number; lng: number } | null
          if (!row) return
          letztePositionRef.current = { lat: row.lat, lng: row.lng }
          setState((s) => ({ ...s, isTracking: true, lat: row.lat, lng: row.lng }))
          aktualisiereEta(row.lat, row.lng)
        },
      )
      .subscribe()

    // ETA periodisch auffrischen (Stau-Updates etc.)
    etaTimerRef.current = setInterval(() => {
      const pos = letztePositionRef.current
      if (pos) aktualisiereEta(pos.lat, pos.lng)
    }, ETA_REFRESH_INTERVALL_MS)

    return () => {
      supabase.removeChannel(channel)
      if (etaTimerRef.current) clearInterval(etaTimerRef.current)
    }
  }, [svId, zielAdresse]) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}
