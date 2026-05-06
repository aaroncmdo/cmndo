'use client'

// CMM-32-mapbox: Heute-Tab im normalen GutachterShell-Wrapper.
//   • Desktop: 2-Spalten — Termine links, Map rechts (bündig zum Bildschirmrand)
//   • Mobile: Stack — Map oben, Termine darunter
// Padding-Kompensation via -m-* damit die Map den Wrapper-Innenrand bündig
// abschließt (oben/unten/rechts) und nur die Termine-Spalte das main-padding
// nutzt.

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import TagesrouteSidebar, { type TagesroutePflichtStat } from './TagesrouteSidebar'
import TagesrouteStartCard from './TagesrouteStartCard'
import TagesvorbereitungButton from '../auftraege/TagesvorbereitungButton'
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

  // 2026-05-06 (Versuch 6 — position: fixed nuklear): nach 5 fehlgeschlagenen
  // CSS-Layout-Versuchen wird die Map jetzt komplett aus dem Flow gezogen
  // und am Viewport festgenagelt. Auf Mobile bleibt sie im normalen Stack
  // mit expliziter Höhe (h-[60vh]). Auf Desktop (lg+) wird sie und die
  // Aside per `position: fixed` mit hartcodierten Pixel-Offsets vom
  // Viewport-Rand angedockt — kein Parent-Chain mehr, deterministisch.

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

  return (
    <>
      {/* Karten-Spalte — Mobile: gestackt oben, 60vh.
          Desktop (lg+): position:fixed angedockt an Viewport.
          - top:110 = Header (~80) + Padding (~30)
          - right:16, bottom:16 = main-Padding-Margin
          - left:688 = Sidebar (256) + main-pl (16) + aside-Breite (416) */}
      <div className="rounded-xl overflow-hidden border border-claimondo-border bg-[#f8f9fb] mb-4 h-[60vh] lg:h-auto lg:mb-0 lg:fixed lg:top-[110px] lg:right-4 lg:bottom-4 lg:left-[688px]">
        <TagesrouteMap
          svOrigin={origin}
          stops={stops}
          activeStopId={activeStopId}
          onStopClick={setActiveStopId}
        />
      </div>

      {/* Termine-Spalte — Mobile: normal Flow unter der Map.
          Desktop (lg+): position:fixed links neben der Map. */}
      <aside className="space-y-3 lg:fixed lg:top-[110px] lg:left-[272px] lg:bottom-4 lg:w-[400px] lg:overflow-y-auto lg:flex lg:flex-col">
        <div className="bg-white border border-claimondo-border rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-claimondo-navy">
          <span className="font-medium whitespace-nowrap">Tagesvorbereitung:</span>
          <TagesvorbereitungButton />
        </div>

        <div className="flex-1 min-h-0 bg-white border border-claimondo-border rounded-xl overflow-hidden flex flex-col">
          <TagesrouteSidebar
            termine={termine}
            pflichtStats={pflichtStats}
            svOrigin={origin}
            activeStopId={activeStopId}
            onStopClick={setActiveStopId}
          />
        </div>

        <div className="bg-white border border-claimondo-border rounded-xl overflow-hidden">
          <TagesrouteStartCard
            terminIds={terminIds}
            hasActiveSession={hasActiveSession}
            disabledReason={disabledReason}
          />
        </div>
      </aside>
    </>
  )
}
