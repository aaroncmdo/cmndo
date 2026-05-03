'use client'

// AAR-381: Client-Orchestrator für den Heute-Tab.
// Holt einmalig die GPS-Position (für googleMapsLink origin), rendert
// Kalender-Rail + Sidebar.

import { useEffect, useState } from 'react'
import TageskalenderRail from './TageskalenderRail'
import TagesrouteStartCard from './TagesrouteStartCard'
import TagesvorbereitungButton from '../auftraege/TagesvorbereitungButton'
import type { HeuteTerminFull } from './page'

export interface HeuteClientProps {
  termine: HeuteTerminFull[]
  svStandort: { lat: number | null; lng: number | null }
  hasActiveSession: boolean
}

export default function HeuteClient({
  termine,
  svStandort,
  hasActiveSession,
}: HeuteClientProps) {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(
    svStandort.lat != null && svStandort.lng != null
      ? { lat: svStandort.lat, lng: svStandort.lng }
      : null,
  )

  // Opportunistisch GPS holen, aber nicht blockierend — fallback ist
  // sachverstaendige.standort_lat/lng (Home-Basis).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* Permission denied — Home-Basis bleibt. */
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
    )
  }, [])

  const aktiveTermine = termine.filter(
    (t) => t.status !== 'abgeschlossen' && t.status !== 'abgelehnt',
  )
  const terminIds = aktiveTermine.map((t) => t.id)

  const disabledReason =
    aktiveTermine.length === 0 ? 'Heute keine offenen Termine' : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4">
      {/* Linke Spalte: Tageskalender-Rail */}
      <div className="bg-white border border-claimondo-border rounded-xl p-4 overflow-y-auto max-h-[calc(100vh-180px)]">
        <h2 className="text-sm font-semibold text-claimondo-navy mb-3">
          Tageskalender
        </h2>
        <TageskalenderRail termine={termine} svOrigin={origin} />
      </div>

      {/* Rechte Spalte: KPIs + Start-Karte */}
      <div className="space-y-3">
        <TagesrouteStartCard
          terminIds={terminIds}
          hasActiveSession={hasActiveSession}
          disabledReason={disabledReason}
        />
        <div className="bg-white border border-claimondo-border rounded-xl p-4">
          <p className="text-[10px] text-claimondo-ondo uppercase tracking-wider">
            Termine heute
          </p>
          <p className="text-2xl font-semibold text-claimondo-navy mt-1">
            {aktiveTermine.length}
          </p>
        </div>
        {/* Aaron 2026-04-30: Tagesvorbereitung-Export auch hier auf Heute-Seite */}
        <div className="bg-white border border-claimondo-border rounded-xl p-4">
          <p className="text-[10px] text-claimondo-ondo uppercase tracking-wider mb-2">
            Tagesvorbereitung
          </p>
          <TagesvorbereitungButton />
          <p className="text-[10px] text-claimondo-ondo/70 mt-2 leading-tight">
            CSV mit allen Stammdaten der Tagestermine — Import in
            AutoiXpert / Audatex / Excel.
          </p>
        </div>
      </div>
    </div>
  )
}
