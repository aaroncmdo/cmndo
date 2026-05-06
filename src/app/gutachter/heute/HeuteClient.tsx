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

  // 2026-05-06 (Versuch 5): Outer kriegt inline `height: calc(100dvh - 130px)`.
  // Nicht via Tailwind-Klasse (die ggf. ohne Spaces invalid kompiliert) sondern
  // direkt als inline-style — Browser parst das deterministisch. 100dvh =
  // dynamic viewport height (mobile-chrome-aware). 130px deckt Header +
  // WeatherBanner + main-Padding ab. JS-Mess-Komplexität raus, weil
  // explizite Pixel-Berechnung via calc reicht.
  const wrapperHeight = 'calc(100dvh - 130px)'

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
    // 2026-05-06 (Versuch 5): Reset auf simples Flex mit inline-calc-Height.
    // Keine `absolute inset-0`, keine `min-h-full md:h-full`, keine JS-
    // Messung. Inline `height: calc(100dvh - 130px)` ist deterministisch
    // (Browser parst calc direkt, kein Tailwind-Compile-Bug, kein Chain).
    // Negative Margins bleiben für bündigen Map-zum-Wrapper-Rand.
    <div
      className="-m-2 sm:-m-3 lg:-m-4 flex flex-col md:flex-row"
      style={{ height: wrapperHeight }}
    >
      {/* Termine-Spalte — links auf Desktop, unter der Karte auf Mobile.
          Hat eigenes padding damit die Cards normal abgesetzt sind. */}
      <aside className="order-2 md:order-1 md:w-[400px] md:shrink-0 md:flex md:flex-col md:h-full p-2 sm:p-3 lg:p-4 md:overflow-y-auto bg-[#f8f9fb] space-y-3">
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

      {/* Karten-Spalte — flex-1 nimmt Restbreite, h-full erbt vom calc-
          Wrapper (deterministische Pixel-Höhe). */}
      <div className="order-1 md:order-2 relative flex-1 h-full">
        <TagesrouteMap
          svOrigin={origin}
          stops={stops}
          activeStopId={activeStopId}
          onStopClick={setActiveStopId}
        />
      </div>
    </div>
  )
}
