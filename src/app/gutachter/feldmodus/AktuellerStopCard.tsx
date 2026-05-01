'use client'

// AAR-382 / Auto-Arrive: Expanded Card für den aktiven Stop im Fokus-Modus.
// Keine manuellen "Losfahren"/"Ich bin angekommen"-Buttons mehr — Ankunft wird
// automatisch erkannt:
//   1. SV im 100m-Geofence UND (Kunde nicht aktiviert ODER Kunde angekommen)
//   2. Fallback: Terminuhrzeit erreicht und GPS nicht verfügbar
// Beim Auslösen ruft onArrived() — FeldmodusClient setzt sessionStatus='arrived'
// → Fallakte öffnet automatisch.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  PhoneIcon,
  NavigationIcon,
  CheckCircle2Icon,
  MapPinIcon,
  CarIcon,
} from 'lucide-react'
import { formatUhrzeit } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import type { FeldmodusStop } from './page'
import type { SessionStatus } from '@/lib/types/field-modus'
import { completeAndAdvance } from './actions'

export interface AktuellerStopCardProps {
  stop: FeldmodusStop
  sessionId: string
  sessionStatus: SessionStatus
  svPosition: { lat: number; lng: number } | null
  svInGeofence: boolean
  permissionState: 'pending' | 'granted' | 'denied'
  onAdvanced: (nextTerminId: string | null) => void
  onArrived: (lat: number, lng: number, via: 'geofence' | 'manuell' | 'termin_uhrzeit') => void
}

function buildGoogleMapsLink(stop: FeldmodusStop): string {
  const base = 'https://www.google.com/maps/dir/?api=1'
  if (stop.place_id) {
    return `${base}&destination=${encodeURIComponent(stop.adresse)}&destination_place_id=${stop.place_id}`
  }
  if (stop.lat != null && stop.lng != null) {
    return `${base}&destination=${stop.lat},${stop.lng}`
  }
  return `${base}&destination=${encodeURIComponent(stop.adresse)}`
}

export default function AktuellerStopCard({
  stop,
  sessionId,
  sessionStatus,
  svPosition,
  svInGeofence,
  permissionState,
  onAdvanced,
  onArrived,
}: AktuellerStopCardProps) {
  const [pending, startTransition] = useTransition()
  const arrivedFiredRef = useRef(false)

  // AAR-384: Kunde-Tracking-State live beobachten.
  const supabase = useMemo(() => createClient(), [])
  const [kundeTracking, setKundeTracking] = useState<{
    aktiviert: boolean
    etaMinutes: number | null
    angekommenAm: string | null
  }>({ aktiviert: false, etaMinutes: null, angekommenAm: null })

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('gutachter_termine')
      .select('kunde_tracking_aktiviert, kunde_eta_minuten, kunde_angekommen_am')
      .eq('id', stop.termin_id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return
        setKundeTracking({
          aktiviert: !!data.kunde_tracking_aktiviert,
          etaMinutes: (data.kunde_eta_minuten as number | null) ?? null,
          angekommenAm: (data.kunde_angekommen_am as string | null) ?? null,
        })
      })
    const channel = supabase
      .channel(`sv-kunde-eta-${stop.termin_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gutachter_termine',
          filter: `id=eq.${stop.termin_id}`,
        },
        (payload) => {
          const row = payload.new as {
            kunde_tracking_aktiviert: boolean | null
            kunde_eta_minuten: number | null
            kunde_angekommen_am: string | null
          }
          setKundeTracking({
            aktiviert: !!row.kunde_tracking_aktiviert,
            etaMinutes: row.kunde_eta_minuten ?? null,
            angekommenAm: row.kunde_angekommen_am ?? null,
          })
        },
      )
      .subscribe()
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [supabase, stop.termin_id])

  const angekommen = Boolean(stop.sv_angekommen_am) || sessionStatus === 'arrived'

  // Reset arrived-flag wenn neuer Stop geladen wird
  useEffect(() => {
    arrivedFiredRef.current = false
  }, [stop.termin_id])

  // Auto-Ankunft via Geofence: SV vor Ort UND Kunde vor Ort (falls aktiv)
  useEffect(() => {
    if (angekommen) return
    if (arrivedFiredRef.current) return
    if (!svInGeofence) return
    // Wenn Kunde aktiv getrackt wird, MUSS er ebenfalls angekommen sein.
    if (kundeTracking.aktiviert && !kundeTracking.angekommenAm) return
    arrivedFiredRef.current = true
    onArrived(
      svPosition?.lat ?? stop.lat ?? 0,
      svPosition?.lng ?? stop.lng ?? 0,
      'geofence',
    )
  }, [
    angekommen,
    svInGeofence,
    kundeTracking.aktiviert,
    kundeTracking.angekommenAm,
    onArrived,
    svPosition,
    stop.lat,
    stop.lng,
  ])

  // Fallback: Terminuhrzeit erreicht und GPS nicht verfügbar
  useEffect(() => {
    if (angekommen) return
    // Wenn beide Seiten GPS-Tracking haben, kein Zeit-Fallback nötig
    if (permissionState === 'granted' && kundeTracking.aktiviert) return
    const startMs = new Date(stop.start_zeit).getTime()
    const delay = Math.max(0, startMs - Date.now())
    const timer = setTimeout(() => {
      if (arrivedFiredRef.current) return
      if (angekommen) return
      arrivedFiredRef.current = true
      onArrived(stop.lat ?? 0, stop.lng ?? 0, 'termin_uhrzeit')
    }, delay)
    return () => clearTimeout(timer)
  }, [
    angekommen,
    permissionState,
    kundeTracking.aktiviert,
    stop.start_zeit,
    stop.lat,
    stop.lng,
    onArrived,
  ])

  function onAbschliessen() {
    startTransition(async () => {
      const res = await completeAndAdvance(sessionId, stop.termin_id)
      if (res.success) {
        toast.success(
          res.nextTerminId ? 'Abgeschlossen, nächster Stop aktiv' : 'Alle Stops erledigt',
        )
        onAdvanced(res.nextTerminId ?? null)
      } else {
        toast.error(res.error ?? 'Abschluss fehlgeschlagen')
      }
    })
  }

  const mapsLink = buildGoogleMapsLink(stop)

  // Status-Hinweis für den SV (ersetzt die alten Action-Buttons)
  const statusHinweis = (() => {
    if (angekommen) return null
    if (svInGeofence && kundeTracking.aktiviert && !kundeTracking.angekommenAm) {
      return 'Du bist vor Ort — warte auf Kunde'
    }
    if (svInGeofence) return 'Ankunft wird gleich bestätigt'
    if (permissionState === 'denied') {
      return 'GPS verweigert — Ankunft wird zur Terminuhrzeit erkannt'
    }
    return 'Auto-Ankunft aktiv (Geofence 100 m)'
  })()

  return (
    <div className="rounded-xl bg-white text-claimondo-navy p-4 shadow-sm space-y-3">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--brand-primary,var(--brand-secondary))]">
            Aktueller Stop
          </span>
          <span className="text-[11px] text-claimondo-ondo">
            {formatUhrzeit(stop.start_zeit)}
          </span>
          {stop.schadentyp && (
            <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-[color:var(--brand-primary,var(--brand-secondary))]/10 text-[color:var(--brand-primary,var(--brand-secondary))] uppercase">
              {stop.schadentyp}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-claimondo-navy">
          {stop.kennzeichen && (
            <span className="font-mono mr-2">{stop.kennzeichen}</span>
          )}
          {stop.fahrzeug ?? stop.kunde_name}
        </p>
        <p className="text-xs text-claimondo-ondo">{stop.kunde_name}</p>
      </div>

      {/* Adresse */}
      <div className="flex items-start gap-2 text-sm text-claimondo-navy">
        <MapPinIcon className="w-4 h-4 text-[color:var(--brand-primary,var(--brand-secondary))] mt-0.5" />
        <p className="flex-1">{stop.adresse}</p>
      </div>

      {/* Kunde-Tracking-Status */}
      {kundeTracking.angekommenAm ? (
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
          <CheckCircle2Icon className="w-4 h-4" />
          Kunde ist vor Ort
        </div>
      ) : kundeTracking.aktiviert ? (
        <div className="flex items-center gap-2 text-xs font-medium text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
          <CarIcon className="w-4 h-4" />
          Kunde unterwegs
          {kundeTracking.etaMinutes != null && (
            <span className="ml-auto">ETA ca. {kundeTracking.etaMinutes} Min</span>
          )}
        </div>
      ) : null}

      {/* Telefonnummer */}
      {stop.kunde_telefon && (
        <a
          href={`tel:${stop.kunde_telefon}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--brand-primary,var(--brand-secondary))] hover:text-[var(--brand-primary)]"
        >
          <PhoneIcon className="w-4 h-4" />
          {stop.kunde_telefon}
        </a>
      )}

      {/* SV-Briefing */}
      {stop.briefing_text && (
        <div className="border-t border-claimondo-border pt-3">
          <p className="text-xs leading-relaxed text-claimondo-navy whitespace-pre-wrap">
            {stop.briefing_text}
          </p>
        </div>
      )}

      {/* Auto-Ankunft-Hinweis (ersetzt alte Action-Buttons) */}
      {statusHinweis && (
        <div className="rounded-lg bg-[color:var(--brand-primary,var(--brand-secondary))]/5 border border-[color:var(--brand-primary,var(--brand-secondary))]/20 px-3 py-2 text-[11px] text-claimondo-navy">
          {statusHinweis}
        </div>
      )}

      {/* Aktionen */}
      <div className="flex flex-col gap-2 pt-2">
        {angekommen && sessionStatus !== 'finished' && (
          <button
            type="button"
            onClick={onAbschliessen}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-semibold py-2.5 hover:bg-[var(--brand-primary)] disabled:opacity-50"
          >
            <CheckCircle2Icon className="w-4 h-4" />
            {pending ? 'Schließe ab …' : 'Besichtigung abschließen'}
          </button>
        )}

        <a
          href={mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-claimondo-border text-claimondo-navy text-sm font-medium py-2 hover:bg-[#f8f9fb]"
        >
          <NavigationIcon className="w-4 h-4" />
          In Google Maps öffnen
        </a>
      </div>
    </div>
  )
}
