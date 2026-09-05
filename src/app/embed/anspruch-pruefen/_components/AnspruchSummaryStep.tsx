'use client'
import type { AnspruchSpanne } from '@/lib/anspruch/types'
import { AnspruchPositionsListe } from '@/components/shared/AnspruchPositionsListe'
import { AnspruchTotalschadenWege } from '@/components/shared/AnspruchTotalschadenWege'
import { schuldBotschaft, KASKO_WERKSTATTBINDUNG_HINWEIS } from '@/lib/anspruch/darstellung'
import { Button } from '@/components/primitives'

const TON_KLASSE = {
  erfolg: { box: 'bg-success-soft', titel: 'text-success-strong' },
  neutral: { box: 'bg-claimondo-bg', titel: 'text-claimondo-navy' },
  warnung: { box: 'bg-warning-soft', titel: 'text-warning-strong' },
} as const

export function AnspruchSummaryStep({
  spanne, onBeauftragen,
}: { spanne: AnspruchSpanne; onBeauftragen: () => void }) {
  const { totalschaden } = spanne
  const botschaft = schuldBotschaft(spanne.schuld)
  const ton = TON_KLASSE[botschaft.ton]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-heading-sm font-bold text-claimondo-navy">Ihr möglicher Anspruch</h2>
        <p className="text-body-sm text-claimondo-shield">
          So machen Sie ihn verbindlich: ein Gutachter erstellt das offizielle Gutachten.
        </p>
      </div>

      {totalschaden ? (
        <div className="space-y-4">
          <p className="text-body-sm text-claimondo-shield">
            Bei diesem Schaden liegt möglicherweise ein{' '}
            <strong className="text-claimondo-navy">wirtschaftlicher Totalschaden</strong>{' '}
            vor. Sie haben zwei Wege. Welcher für Sie gilt, klärt Ihr Gutachter verbindlich.
          </p>

          <AnspruchTotalschadenWege totalschaden={totalschaden} schuld={spanne.schuld} />

          <p className="text-caption text-claimondo-shield">
            Unverbindliche Ersteinschätzung anhand Ihrer Fotos. Den verbindlichen Anspruch ermittelt Ihr Gutachter.
          </p>
        </div>
      ) : (
        <AnspruchPositionsListe spanne={spanne} />
      )}

      <div className={`rounded-ios-md p-4 ${ton.box}`}>
        <p className={`text-heading-sm font-bold ${ton.titel}`}>{botschaft.titel}</p>
        <p className="mt-1 text-body-sm text-claimondo-shield">{botschaft.beleg}</p>
      </div>
      {/* Kasko-WB Phase 2 (D6): keine Tariffrage hier (die stellt der FlowLink), aber der Hinweis auf die Bindung. */}
      {spanne.schuld === 'selbst' && (
        <p className="text-body-sm text-claimondo-shield" data-testid="anspruch-kasko-wb-hinweis">
          {KASKO_WERKSTATTBINDUNG_HINWEIS}
        </p>
      )}

      <Button onClick={onBeauftragen} className="w-full">Gutachter beauftragen</Button>
    </div>
  )
}
