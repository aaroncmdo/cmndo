import { SectionCard } from '@/components/shared/SectionCard'
import { FieldRow } from './fields'

// Vertrag-Section — aus ProfilClient extrahiert (Task 2).
// Reine Anzeige (kein 'use client' nötig), kein interaktiver State.

export function ProfilVertrag({
  paketLabel,
  offene,
  gesamt,
  zugewiesen,
}: {
  paketLabel: string
  offene: number
  gesamt: number
  zugewiesen: number
}) {
  return (
    <SectionCard className="p-6 mt-5">
      <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Vertrag</h2>
      <div className="space-y-0">
        <FieldRow label="Paket" value={paketLabel} />
        <FieldRow label="Offene Fälle" value={`${offene} / ${gesamt}`} />
        <FieldRow label="Zugewiesene Fälle gesamt" value={String(zugewiesen)} />
      </div>
    </SectionCard>
  )
}
