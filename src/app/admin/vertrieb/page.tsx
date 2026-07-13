// src/app/admin/vertrieb/page.tsx
// Vertrieb-Konsole: die "Übersicht" (Roster über alle 5 Partner-Typen). RSC lädt den
// Staff-gegateten getVertriebDaten und reicht die Kontakte an den Client (rollup bleibt im
// Vertrag, wird aber nicht mehr gebraucht — KPIs kommen client-seitig aus computeContextKpis).
// Den Titel liefert das Konsolen-Layout (layout.tsx) — die Seite rendert nur den Cockpit-Roster.
import { getVertriebDaten } from './_lib/get-vertrieb-daten'
import { getVertriebLiveOps } from './_lib/get-vertrieb-live-ops'
import VertriebRosterClient from './VertriebRosterClient'
import type { LiveOpsData } from '@/components/live-ops/types'

const LEER_LIVEOPS: LiveOpsData = { svs: [], termine: [], routen: [], tagesrouten: [], deadPins: [], leads: [] }

export default async function VertriebPage() {
  // Roster + Live-Ops parallel laden. Live-Ops ist fail-soft (leere Daten bei Fehler),
  // damit ein Mapbox-/Matrix-Fehler nie den Roster bricht.
  const [res, lo] = await Promise.all([getVertriebDaten(), getVertriebLiveOps()])
  return (
    <div className="px-4 sm:px-6 py-6">
      {res.ok ? (
        <VertriebRosterClient
          kontakte={res.kontakte}
          rollup={res.rollup}
          liveOps={lo.ok ? lo.data : LEER_LIVEOPS}
          liveOpsRole={lo.ok ? lo.role : 'admin'}
        />
      ) : (
        <p className="text-sm text-danger">{res.error}</p>
      )}
    </div>
  )
}
