'use client'

// Heute-Tab:
//   • Desktop: Cards-Spalte rechts (Tagesvorbereitung / Termine / Tagesroute)
//   • Mobile: Bottom-Sheet (collapsed = Name nächster Kunde; expanded =
//     alle Termine + Tagesroute starten)
// In beiden Fällen füllt Mapbox den Hintergrund komplett.

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ClockIcon, ChevronUpIcon, UserIcon } from 'lucide-react'
import TagesrouteSidebar, { type TagesroutePflichtStat } from './TagesrouteSidebar'
import TagesrouteStartCard from './TagesrouteStartCard'
import TagesvorbereitungButton from '../auftraege/TagesvorbereitungButton'
import MobileBottomSheet from '@/components/sv/MobileBottomSheet'
import { formatUhrzeit } from '@/lib/format'
import type { HeuteTerminFull } from './page'
import type { TagesrouteStop } from './TagesrouteMap'

// Mapbox-Karte nur clientseitig laden (mapbox-gl referenziert window beim Import)
const TagesrouteMap = dynamic(() => import('./TagesrouteMap'), { ssr: false })

export interface HeuteClientProps {
  termine: HeuteTerminFull[]
  pflichtStats: TagesroutePflichtStat[]
  svStandort: { lat: number | null; lng: number | null }
  hasActiveSession: boolean
}

export default function HeuteClient({
  termine,
  pflichtStats,
  svStandort,
  hasActiveSession,
}: HeuteClientProps) {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(
    svStandort.lat != null && svStandort.lng != null
      ? { lat: svStandort.lat, lng: svStandort.lng }
      : null,
  )
  const [activeStopId, setActiveStopId] = useState<string | null>(null)

  // Opportunistisch GPS holen
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
    )
  }, [])

  const aktiveTermine = useMemo(
    () => termine.filter((t) => t.status !== 'abgeschlossen' && t.status !== 'abgelehnt'),
    [termine],
  )
  const terminIds = aktiveTermine.map((t) => t.id)

  // Stops für die Karte: nur aktive Termine mit gültigen Koordinaten,
  // sortiert nach Startzeit
  const stops: TagesrouteStop[] = useMemo(() => {
    return [...aktiveTermine]
      .filter((t) => t.besichtigungsort_lat != null && t.besichtigungsort_lng != null)
      .sort((a, b) => new Date(a.start_zeit).getTime() - new Date(b.start_zeit).getTime())
      .map((t) => ({
        id: t.id,
        startIso: t.start_zeit,
        lat: t.besichtigungsort_lat as number,
        lng: t.besichtigungsort_lng as number,
        label: t.kunde_name,
      }))
  }, [aktiveTermine])

  const disabledReason = aktiveTermine.length === 0 ? 'Heute keine offenen Termine' : null

  // Nächster aktiver Termin für den Bottom-Sheet-Header
  const naechsterStop = useMemo(() => {
    const now = Date.now()
    return [...aktiveTermine]
      .sort((a, b) => new Date(a.start_zeit).getTime() - new Date(b.start_zeit).getTime())
      .find((t) => new Date(t.start_zeit).getTime() >= now - 60 * 60_000) ?? aktiveTermine[0] ?? null
  }, [aktiveTermine])

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Mapbox füllt den ganzen Bereich — GutachterShell entfernt Padding
          + Rounded für die Heute-Page (siehe isFullscreenMap dort). */}
      <div className="absolute inset-0">
        <TagesrouteMap
          svOrigin={origin}
          stops={stops}
          activeStopId={activeStopId}
          onStopClick={setActiveStopId}
        />
      </div>

      {/* Desktop: Floating-Spalte rechts (md+). Mobile: hidden — wir
          nutzen stattdessen den Bottom-Sheet darunter. */}
      <div className="hidden md:flex absolute top-4 right-4 bottom-4 z-10 w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-3 pointer-events-none">
        {/* Tagesvorbereitung — oben, kompakt */}
        <div className="bg-white/95 backdrop-blur border border-claimondo-border rounded-xl px-3 py-2 shadow-lg flex items-center gap-2 text-xs text-claimondo-navy pointer-events-auto shrink-0">
          <span className="font-medium whitespace-nowrap">Tagesvorbereitung:</span>
          <TagesvorbereitungButton />
        </div>

        {/* Termin-Liste — füllt den Rest, scrollt intern */}
        <div className="flex-1 min-h-0 bg-white/95 backdrop-blur border border-claimondo-border rounded-xl shadow-lg overflow-hidden flex flex-col pointer-events-auto">
          <TagesrouteSidebar
            termine={termine}
            pflichtStats={pflichtStats}
            svOrigin={origin}
            activeStopId={activeStopId}
            onStopClick={setActiveStopId}
          />
        </div>

        {/* Tagesroute-Start — unten */}
        <div className="bg-white/95 backdrop-blur border border-claimondo-border rounded-xl shadow-lg overflow-hidden pointer-events-auto shrink-0">
          <TagesrouteStartCard
            terminIds={terminIds}
            hasActiveSession={hasActiveSession}
            disabledReason={disabledReason}
          />
        </div>
      </div>

      {/* Mobile-Bottom-Sheet (md:hidden) — collapsed zeigt nur den nächsten
          Kunden, expanded zeigt Termin-Liste + Tagesroute-Start. */}
      <MobileBottomSheet
        className="md:hidden"
        header={
          naechsterStop ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 shrink-0 rounded-full bg-claimondo-ondo/10 flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-claimondo-ondo" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 leading-tight">
                  Nächster Termin
                </p>
                <p className="text-sm font-semibold text-claimondo-navy truncate leading-tight">
                  {naechsterStop.kunde_name}
                </p>
                <p className="text-[11px] text-claimondo-ondo flex items-center gap-1 leading-tight">
                  <ClockIcon className="w-3 h-3" />
                  {formatUhrzeit(naechsterStop.start_zeit)}
                  {naechsterStop.fahrzeug && (
                    <span className="ml-1 truncate">· {naechsterStop.fahrzeug}</span>
                  )}
                </p>
              </div>
              <ChevronUpIcon className="w-4 h-4 text-claimondo-ondo/60 shrink-0" />
            </div>
          ) : (
            <p className="text-sm text-claimondo-ondo text-center py-2">
              Heute keine offenen Termine
            </p>
          )
        }
      >
        <div className="flex flex-col h-full">
          {/* Tagesroute-Start oben (sticky-feel im Sheet) */}
          <div className="shrink-0 p-3 border-b border-claimondo-border">
            <TagesrouteStartCard
              terminIds={terminIds}
              hasActiveSession={hasActiveSession}
              disabledReason={disabledReason}
            />
          </div>
          {/* Termin-Liste — scrollt intern */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <TagesrouteSidebar
              termine={termine}
              pflichtStats={pflichtStats}
              svOrigin={origin}
              activeStopId={activeStopId}
              onStopClick={setActiveStopId}
            />
          </div>
          {/* Tagesvorbereitung unten */}
          <div className="shrink-0 p-3 border-t border-claimondo-border bg-[#f8f9fb] flex items-center gap-2 text-xs text-claimondo-navy">
            <span className="font-medium whitespace-nowrap">Tagesvorbereitung:</span>
            <TagesvorbereitungButton />
          </div>
        </div>
      </MobileBottomSheet>
    </div>
  )
}
