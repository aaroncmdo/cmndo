// src/app/admin/vertrieb/karte/page.tsx
// Vertrieb-Konsole: Karte-View — full-bleed Mapbox über alle Partner/Leads.
// Lädt den Staff-gegateten getVertriebDaten (wie die Übersicht). Bringt den eigenen
// PageContainer-Escape mit (104.17% von 96% = 100% Main-Breite), da das Konsolen-Layout
// bewusst nicht escapet.
import { getVertriebDaten } from '../_lib/get-vertrieb-daten'
import VertriebKarteClient from './VertriebKarteClient'

export default async function VertriebKartePage() {
  const res = await getVertriebDaten()
  if (!res.ok) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <p className="text-sm text-danger">{res.error}</p>
      </div>
    )
  }
  return (
    <div className="h-full md:w-[104.17%] md:-ml-[2.08%]">
      <VertriebKarteClient kontakte={res.kontakte} />
    </div>
  )
}
