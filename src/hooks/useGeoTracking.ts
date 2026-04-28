'use client'

// CMM-36: Geo-Tracking Hook für den SV während aktiver Termine.
// Läuft solange die App offen ist (watchPosition). Schreibt die Position
// per Upsert in sv_live_location. Berechnet ETA zur Schadens-Adresse via
// Mapbox Directions. Läuft nur wenn zielAdresse gesetzt ist.

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { berechneEta } from '@/lib/mapbox/eta'

export type GeoTrackingState = {
  isTracking: boolean
  lat: number | null
  lng: number | null
  etaMinuten: number | null
  etaAnkunftzeit: Date | null
  fehler: string | null
}

const ETA_REFRESH_INTERVALL_MS = 30_000 // alle 30 Sekunden neue ETA

export function useGeoTracking(opts: {
  svId: string | null
  fallId: string | null
  zielAdresse: string | null
  aktiv: boolean // nur tracken wenn Termin heute aktiv
}): GeoTrackingState {
  const { svId, fallId, zielAdresse, aktiv } = opts

  const [state, setState] = useState<GeoTrackingState>({
    isTracking: false,
    lat: null,
    lng: null,
    etaMinuten: null,
    etaAnkunftzeit: null,
    fehler: null,
  })

  const watchIdRef = useRef<number | null>(null)
  const etaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const letztePositionRef = useRef<{ lat: number; lng: number } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!aktiv || !svId || !fallId || typeof navigator === 'undefined' || !navigator.geolocation) {
      return
    }

    async function schreibePosition(lat: number, lng: number, accuracy: number) {
      letztePositionRef.current = { lat, lng }
      setState((s) => ({ ...s, isTracking: true, lat, lng, fehler: null }))

      // Upsert in sv_live_location (eine Zeile pro SV)
      await supabase.from('sv_live_location').upsert(
        { sv_id: svId, fall_id: fallId, lat, lng, accuracy, updated_at: new Date().toISOString() },
        { onConflict: 'sv_id' },
      )
    }

    async function aktualisiereEta() {
      const pos = letztePositionRef.current
      if (!pos || !zielAdresse) return
      const eta = await berechneEta(pos.lat, pos.lng, zielAdresse)
      if (eta) {
        setState((s) => ({ ...s, etaMinuten: eta.etaMinuten, etaAnkunftzeit: eta.etaAnkunftzeit }))
        // eta_minuten in DB nachziehen
        await supabase
          .from('sv_live_location')
          .update({ eta_minuten: eta.etaMinuten })
          .eq('sv_id', svId)
      }
    }

    // Positions-Watch starten
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        schreibePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)
      },
      (err) => {
        setState((s) => ({ ...s, fehler: err.message }))
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    )

    // ETA sofort + dann alle 30s
    aktualisiereEta()
    etaTimerRef.current = setInterval(aktualisiereEta, ETA_REFRESH_INTERVALL_MS)

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      if (etaTimerRef.current !== null) clearInterval(etaTimerRef.current)
    }
  }, [aktiv, svId, fallId, zielAdresse]) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}
