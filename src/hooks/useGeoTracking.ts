'use client'

// CMM-36: Liest die Live-Position des SVs aus sv_live_location (Realtime)
// und berechnet ETA zur Schadens-Adresse via Mapbox. Wird in FallDetailClient
// verwendet. Die Position selbst schreibt useGeoPosition im Layout.
//
// Sichtbarkeit ist termin-fenstergesteuert: das Banner erscheint nur zwischen
//   (start_zeit - max(geschaetzte_fahrtzeit_min, 90) - 15 min Puffer)
// und
//   (kunde_angekommen_am ?? start_zeit + 60 min).
// Dadurch flackert das Banner nicht den ganzen Tag, nur weil der SV die App
// offen hat, sondern realistisch im Anfahrts-Fenster zum konkreten Termin.

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
const FENSTER_PUFFER_MIN = 15
const FENSTER_FALLBACK_MIN = 90

function imAnfahrtsFenster(opts: {
  terminStartIso: string | null
  geschaetzteFahrtzeitMin: number | null
  kundeAngekommenAm: string | null
}): boolean {
  if (opts.terminStartIso == null) return true // kein Termin gesetzt → wie gehabt
  const start = new Date(opts.terminStartIso).getTime()
  if (Number.isNaN(start)) return false
  const fahrtzeit = Math.max(opts.geschaetzteFahrtzeitMin ?? FENSTER_FALLBACK_MIN, FENSTER_FALLBACK_MIN)
  const fensterStart = start - (fahrtzeit + FENSTER_PUFFER_MIN) * 60_000
  const fensterEnde = opts.kundeAngekommenAm
    ? new Date(opts.kundeAngekommenAm).getTime()
    : start + 60 * 60_000
  const now = Date.now()
  return now >= fensterStart && now <= fensterEnde
}

export function useGeoTracking(opts: {
  svId: string | null
  zielAdresse: string | null
  terminStartIso?: string | null
  geschaetzteFahrtzeitMin?: number | null
  kundeAngekommenAm?: string | null
}): GeoTrackingState {
  const {
    svId,
    zielAdresse,
    terminStartIso = null,
    geschaetzteFahrtzeitMin = null,
    kundeAngekommenAm = null,
  } = opts

  const [state, setState] = useState<GeoTrackingState>({
    isTracking: false,
    lat: null,
    lng: null,
    etaMinuten: null,
    etaAnkunftzeit: null,
  })

  const etaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fensterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const letztePositionRef = useRef<{ lat: number; lng: number } | null>(null)
  const supabase = createClient()

  async function aktualisiereEta(lat: number, lng: number) {
    if (!zielAdresse) return
    const eta = await berechneEta(lat, lng, zielAdresse)
    if (eta) {
      setState((s) => ({ ...s, etaMinuten: eta.etaMinuten, etaAnkunftzeit: eta.etaAnkunftzeit }))
    }
  }

  function fensterAktiv(): boolean {
    return imAnfahrtsFenster({ terminStartIso, geschaetzteFahrtzeitMin, kundeAngekommenAm })
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
        setState((s) => ({ ...s, isTracking: fensterAktiv(), lat, lng }))
        if (fensterAktiv()) aktualisiereEta(lat, lng)
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
          setState((s) => ({ ...s, isTracking: fensterAktiv(), lat: row.lat, lng: row.lng }))
          if (fensterAktiv()) aktualisiereEta(row.lat, row.lng)
        },
      )
      .subscribe()

    // ETA periodisch auffrischen (Stau-Updates etc.)
    etaTimerRef.current = setInterval(() => {
      const pos = letztePositionRef.current
      if (pos && fensterAktiv()) aktualisiereEta(pos.lat, pos.lng)
    }, ETA_REFRESH_INTERVALL_MS)

    // Fenster-Status alle 30s neu evaluieren (für Banner-Auf/Zu rund um die Termin-Zeit)
    fensterTimerRef.current = setInterval(() => {
      setState((s) => {
        const aktiv = fensterAktiv() && letztePositionRef.current != null
        if (s.isTracking === aktiv) return s
        return { ...s, isTracking: aktiv }
      })
    }, ETA_REFRESH_INTERVALL_MS)

    return () => {
      supabase.removeChannel(channel)
      if (etaTimerRef.current) clearInterval(etaTimerRef.current)
      if (fensterTimerRef.current) clearInterval(fensterTimerRef.current)
    }
  }, [svId, zielAdresse, terminStartIso, geschaetzteFahrtzeitMin, kundeAngekommenAm]) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}
