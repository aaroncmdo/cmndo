// src/app/admin/vertrieb/page.tsx
// Vertrieb-CRM P1a: der /admin/vertrieb-Roster (erster sichtbarer UI-Schritt). RSC laedt
// den Staff-gegateten getVertriebDaten (P1a T1) und reicht Kontakte+Rollup an den Client.
import { getVertriebDaten } from './_lib/get-vertrieb-daten'
import VertriebRosterClient from './VertriebRosterClient'
import PageHeader from '@/components/shared/PageHeader'

export default async function VertriebPage() {
  const res = await getVertriebDaten()
  return (
    <div className="px-4 sm:px-6 py-6">
      <PageHeader title="Vertrieb" />
      <p className="text-sm text-claimondo-ondo/70 mt-0.5 mb-4">
        Partner &amp; Leads — alle Typen in einem Roster.
      </p>
      {res.ok ? (
        <VertriebRosterClient kontakte={res.kontakte} rollup={res.rollup} />
      ) : (
        <p className="text-sm text-danger">{res.error}</p>
      )}
    </div>
  )
}
