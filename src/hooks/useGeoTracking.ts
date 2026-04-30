'use client'

// CMM-36: Read-only-Hook für die SV-Fallseite. Liest die Live-Position
// aus sv_live_location (Realtime) und liefert nur Display-State —
// alle Schreibvorgänge (ETA-Spiegelung auf Termin, Auto-Ankunft) laufen
// zentral in useGeoPosition (Layout, always-on).
//
// Sichtbarkeit ist termin-fenstergesteuert: das Banner erscheint nur
// zwischen (start_zeit - max(geschaetzte_fahrtzeit_min, 90) - 15 min)
// und (kunde_angekommen_am ?? start_zeit + 60 min).

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export type GeoTrackingState = {
  isTracking: boolean
  lat: number | null
  lng: number | null
  etaMinuten: number | null
  etaAnkunftzeit: Date | null
}

const FENSTER_PUFFER_MIN = 15
const FENSTER_FALLBACK_MIN = 90
const FENSTER_REFRESH_MS = 30_000

function imAnfahrtsFenster(opts: {
  terminStartIso: string | null
  terminStatus: string | null
  geschaetzteFahrtzeitMin: number | null
  kundeAngekommenAm: string | null
}): boolean {
  // AAR-864: Ohne aktiven Termin oder im Verlegungs-Pending-/Verlegt-State
  // niemals tracken — sonst zeigt das SV-Banner „... ist unterwegs" obwohl
  // gar kein Termin scharf ist.
  if (opts.terminStartIso == null) return false
  if (
    opts.terminStatus === 'verlegung_pending' ||
    opts.terminStatus === 'verlegt' ||
    opts.terminStatus === 'storniert' ||
    opts.terminStatus === 'abgesagt' ||
    opts.terminStatus === 'abgelehnt'
  ) {
    return false
  }
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
  /** AAR-864: Status des aktiven Termins — verlegung_pending / verlegt
   *  schalten Tracking aus. */
  terminStatus?: string | null
  geschaetzteFahrtzeitMin?: number | null
  kundeAngekommenAm?: string | null
  /** Nur informativ — die Logik (Auto-Ankunft, ETA-Spiegelung) lebt in useGeoPosition. */
  terminId?: string | null
  zielLat?: number | null
  zielLng?: number | null
  /** Server-seitig vorab gespiegelte ETA-Minuten (gutachter_termine.sv_eta_minuten). */
  initialEtaMinuten?: number | null
}): GeoTrackingState {
  const {
    svId,
    terminStartIso = null,
    terminStatus = null,
    geschaetzteFahrtzeitMin = null,
    kundeAngekommenAm = null,
    terminId = null,
    initialEtaMinuten = null,
  } = opts

  const [state, setState] = useState<GeoTrackingState>({
    isTracking: false,
    lat: null,
    lng: null,
    etaMinuten: initialEtaMinuten,
    etaAnkunftzeit: initialEtaMinuten != null ? new Date(Date.now() + initialEtaMinuten * 60_000) : null,
  })

  const fensterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const supabase = createClient()
  const router = useRouter()
  // Letzten beobachteten Phase-Marker merken — damit wir router.refresh() nur
  // bei echten Phasen-Übergängen (termin → besichtigung) feuern, nicht auf
  // jedem ETA-Tick.
  const phaseSignaturRef = useRef<string>(`${kundeAngekommenAm ?? 'no_arr'}|${'no_unterwegs'}`)

  function fensterAktiv(): boolean {
    return imAnfahrtsFenster({ terminStartIso, terminStatus, geschaetzteFahrtzeitMin, kundeAngekommenAm })
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
        setState((s) => ({ ...s, isTracking: fensterAktiv(), lat, lng }))
      })

    // Realtime: nur die Position für eventuelle Map-Anzeige spiegeln
    const channel = supabase
      .channel(`geo-tracking-${svId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sv_live_location', filter: `sv_id=eq.${svId}` },
        (payload) => {
          const row = payload.new as { lat: number; lng: number } | null
          if (!row) return
          setState((s) => ({ ...s, isTracking: fensterAktiv(), lat: row.lat, lng: row.lng }))
        },
      )
      .subscribe()

    // Fenster-Status alle 30 s neu evaluieren
    fensterTimerRef.current = setInterval(() => {
      setState((s) => {
        const aktiv = fensterAktiv()
        if (s.isTracking === aktiv) return s
        return { ...s, isTracking: aktiv }
      })
    }, FENSTER_REFRESH_MS)

    // Termin-Realtime: ETA-Updates aus useGeoPosition aufnehmen
    const terminChannel = terminId
      ? supabase
          .channel(`termin-eta-${terminId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'gutachter_termine', filter: `id=eq.${terminId}` },
            (payload) => {
              const row = payload.new as {
                sv_eta_minuten: number | null
                sv_angekommen_am: string | null
                sv_unterwegs_seit: string | null
              }
              setState((s) => ({
                ...s,
                etaMinuten: row.sv_eta_minuten ?? null,
                etaAnkunftzeit:
                  row.sv_eta_minuten != null
                    ? new Date(Date.now() + row.sv_eta_minuten * 60_000)
                    : null,
                isTracking: !row.sv_angekommen_am && fensterAktiv(),
              }))
              // Bei Phase-Übergang Stepper neu rechnen lassen
              const sig = `${row.sv_angekommen_am ?? 'no_arr'}|${row.sv_unterwegs_seit ?? 'no_unterwegs'}`
              if (sig !== phaseSignaturRef.current) {
                phaseSignaturRef.current = sig
                router.refresh()
              }
            },
          )
          .subscribe()
      : null

    return () => {
      supabase.removeChannel(channel)
      if (terminChannel) supabase.removeChannel(terminChannel)
      if (fensterTimerRef.current) clearInterval(fensterTimerRef.current)
    }
  }, [svId, terminId, terminStartIso, geschaetzteFahrtzeitMin, kundeAngekommenAm]) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}
