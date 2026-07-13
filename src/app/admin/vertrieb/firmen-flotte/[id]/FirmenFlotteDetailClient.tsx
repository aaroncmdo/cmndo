'use client'

// Firmen-Flotten-Akte — Sektions-Shell (Task 4). Fuenf Sektionen analog Werkstatt-Detail:
// Stammdaten (Task 5), Fahrzeuge (Task 6), Karten (Task 7), Schaeden (Task 8), Konto (Task 9).
// Hier zunaechst nur die Struktur + Kopfzeile; die Sektionen fuellen die Folge-Tasks.
import { BuildingIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import type { FirmenFlotteDetail } from '../../_lib/firmen-flotte-detail'

export default function FirmenFlotteDetailClient({ detail }: { detail: FirmenFlotteDetail }) {
  const { firma, konten, fahrzeuge, karten, schaeden } = detail
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <PageHeader
        title={firma.name ?? 'Firmen-Flotte'}
        description={`${fahrzeuge.length} Fahrzeuge · ${karten.length} Karten · ${schaeden.length} Schäden · ${konten.length} Flottenmanager`}
        icon={BuildingIcon}
      />

      <SectionCard title="Stammdaten">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 5: editierbare Firma-Stammdaten) —</p>
      </SectionCard>

      <SectionCard title="Fahrzeuge">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 6: Liste + Fahrzeug anlegen) —</p>
      </SectionCard>

      <SectionCard title="Schaden-Karten">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 7: Karten minten + an Fahrzeug binden) —</p>
      </SectionCard>

      <SectionCard title="Schäden">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 8: Claims der Flotte) —</p>
      </SectionCard>

      <SectionCard title="Flottenmanager-Konto">
        <p className="text-body-sm text-claimondo-ondo/60">— folgt (Task 9: Status / deaktivieren) —</p>
      </SectionCard>
    </div>
  )
}
