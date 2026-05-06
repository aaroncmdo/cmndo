'use client'

// CMM-32-mapbox: Heute-Tab im normalen GutachterShell-Wrapper.
//   • Desktop: 2-Spalten — Termine links, Map rechts (bündig zum Bildschirmrand)
//   • Mobile: Stack — Map oben, Termine darunter
// Padding-Kompensation via -m-* damit die Map den Wrapper-Innenrand bündig
// abschließt (oben/unten/rechts) und nur die Termine-Spalte das main-padding
// nutzt.

import { useEffect, useMemo, useRef, useState } from 'react'
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

  // 2026-05-06 (Versuch 4 — endgültig): Map-Spalte misst sich JS-side
  // gegen Viewport. Kein CSS-Chain mehr, kein flex-stretch-Mystery,
  // keine Mapbox-Resize-Race. Wir nehmen die DOM-Position des Column-
  // Refs (top-Offset im Viewport) und berechnen `viewport - top - 16px`
  // als Pixel-Höhe. Das funktioniert garantiert weil:
  //   1. Pixel-Wert ist explicit, kein Percentage-Resolution-Problem
  //   2. Bei Resize wird neu gemessen
  //   3. Mapbox-ResizeObserver triggert auf den Style-Change und
  //      synchronisiert seinen Canvas
  const mapColumnRef = useRef<HTMLDivElement>(null)
  const [mapHeightPx, setMapHeightPx] = useState<number | null>(null)
  useEffect(() => {
    function measure() {
      const el = mapColumnRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const available = window.innerHeight - rect.top - 16
      // Floor 400px damit selbst bei winzigem Viewport Map sichtbar bleibt
      setMapHeightPx(Math.max(400, Math.round(available)))
    }
    measure()
    window.addEventListener('resize', measure)
    // Auch bei Layout-Settling nach Hydration nochmal messen
    const t1 = setTimeout(measure, 50)
    const t2 = setTimeout(measure, 250)
    const t3 = setTimeout(measure, 800)
    return () => {
      window.removeEventListener('resize', measure)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

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
    // 2026-05-06: Robust-Fix für Map-Höhen-Kollaps. Statt `min-h-full
    // md:h-full` (das via Percentage-Chain durch flex-1 + min-h-0 + neg.
    // Margin nicht zuverlässig propagiert) ein `absolute inset-0` gegen
    // den `relative` children-Wrapper im GutachterShell. Damit hat die
    // Map deterministisch full-Height der verbleibenden Main-Fläche.
    // Negative Margins kompensieren weiter das main-padding damit die
    // Map oben/unten/rechts bündig abschließt.
    <div className="absolute inset-0 -m-2 sm:-m-3 lg:-m-4 flex flex-col md:flex-row">
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

      {/* Karten-Spalte — Höhe wird JS-side gemessen + per inline-style
          gesetzt. Bypassed CSS-Chain-Mystery komplett. */}
      <div
        ref={mapColumnRef}
        className="order-1 md:order-2 relative flex-1"
        style={mapHeightPx ? { height: `${mapHeightPx}px` } : { minHeight: '60vh' }}
      >
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
