'use client'

// Werkstatt-KVA-Anzeige (Task 4): read-only Section in der Fallakte.
// Liest claims.kostenvoranschlag_netto/brutto (Werkstatt-Schaetzung, Snapshot vom Lead).
// KVA-Invariante: KEIN Bezug zu schadens_hoehe_netto / gutachten.* (SV-Gutachten-Wert).
// Record-Cast wegen Type-Lag (AGENTS §6).

import { WrenchIcon } from 'lucide-react'
import { useFall } from '../FallContext'
import { SectionCard } from '@/components/shared/SectionCard'

const kvaFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function WerkstattKvaSection() {
  const { claim } = useFall()

  const brutto = (claim as Record<string, unknown> | null)?.kostenvoranschlag_brutto as number | null
  const netto  = (claim as Record<string, unknown> | null)?.kostenvoranschlag_netto  as number | null
  const betrag = brutto ?? netto

  // Conditional-render: nur wenn ein Betrag gesetzt ist
  if (betrag == null) return null

  return (
    <SectionCard
      icon={<WrenchIcon className="w-4 h-4 text-claimondo-ondo/70" />}
      title="Kostenvoranschlag Werkstatt"
      hint="Schätzung, vor SV-Gutachten"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-body font-semibold text-claimondo-navy">
          {kvaFormat.format(betrag)}
        </span>
        {brutto == null && netto != null && (
          <span className="text-caption text-claimondo-ondo/70">(Netto)</span>
        )}
      </div>
      <p className="mt-1 text-caption text-claimondo-ondo/70">
        Werkstatt-Schätzung — nicht der SV-Gutachtenwert. Getrennte Spur, kein Einfluss auf Schadenshöhe.
      </p>
    </SectionCard>
  )
}
