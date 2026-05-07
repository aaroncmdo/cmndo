'use client'

// 2026-05-07 Design-Review Item 1.5: Client-Wrapper um die Auftraege-Liste,
// damit die Density-Toggle persistierten Mode lesen kann und an jede
// AuftragCard durchreicht. Server-Page baut die Props-Array, hier die UI.

import AuftragCard, { type AuftragCardProps } from './AuftragCard'
import DensityToggle from '@/components/shared/DensityToggle'
import { useDensityPreference } from '@/hooks/useDensityPreference'

type Props = {
  items: AuftragCardProps[]
}

export default function AuftraegeGrid({ items }: Props) {
  const [density] = useDensityPreference('gutachter-auftraege')
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DensityToggle listKey="gutachter-auftraege" />
      </div>
      <div
        className={
          density === 'compact'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3'
            : 'grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4'
        }
      >
        {items.map((p) => (
          <AuftragCard key={p.fall.id + p.statusLabel} {...p} density={density} />
        ))}
      </div>
    </div>
  )
}
