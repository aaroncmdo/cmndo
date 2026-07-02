'use client'
import type { AnspruchSpanne } from '@/lib/anspruch/types'
import { AnspruchPositionsListe } from '@/components/shared/AnspruchPositionsListe'
import { Button } from '@/components/primitives'

export function AnspruchSummaryStep({
  spanne, onBeauftragen,
}: { spanne: AnspruchSpanne; onBeauftragen: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-heading-sm font-bold text-claimondo-navy">Ihr möglicher Anspruch</h2>
        <p className="text-body-sm text-claimondo-shield">
          So machen Sie ihn verbindlich: ein Gutachter erstellt das offizielle Gutachten.
        </p>
      </div>
      <AnspruchPositionsListe spanne={spanne} />
      <Button onClick={onBeauftragen} className="w-full">Gutachter beauftragen</Button>
    </div>
  )
}
