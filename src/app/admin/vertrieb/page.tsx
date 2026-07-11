// src/app/admin/vertrieb/page.tsx
// Vertrieb-Konsole: die "Übersicht" (Roster über alle 5 Partner-Typen). RSC lädt den
// Staff-gegateten getVertriebDaten und reicht die Kontakte an den Client (rollup bleibt im
// Vertrag, wird aber nicht mehr gebraucht — KPIs kommen client-seitig aus computeContextKpis).
// Den Titel liefert das Konsolen-Layout (layout.tsx) — die Seite rendert nur den Cockpit-Roster.
import { getVertriebDaten } from './_lib/get-vertrieb-daten'
import VertriebRosterClient from './VertriebRosterClient'

export default async function VertriebPage() {
  const res = await getVertriebDaten()
  return (
    <div className="px-4 sm:px-6 py-6">
      {res.ok ? (
        <VertriebRosterClient kontakte={res.kontakte} rollup={res.rollup} />
      ) : (
        <p className="text-sm text-danger">{res.error}</p>
      )}
    </div>
  )
}
