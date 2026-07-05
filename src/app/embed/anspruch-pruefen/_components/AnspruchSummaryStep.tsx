'use client'
import type { AnspruchSpanne, AnspruchWeg } from '@/lib/anspruch/types'
import { AnspruchPositionsListe } from '@/components/shared/AnspruchPositionsListe'
import { Button } from '@/components/primitives'

/** Adapter: baut aus einem AnspruchWeg eine minimale AnspruchSpanne für AnspruchPositionsListe */
function wegZuSpanne(weg: AnspruchWeg): AnspruchSpanne {
  return {
    positionen: weg.positionen,
    gesamtMinEur: weg.summeMinEur,
    gesamtMaxEur: weg.summeMaxEur,
    hinweise: [],
  }
}

export function AnspruchSummaryStep({
  spanne, onBeauftragen,
}: { spanne: AnspruchSpanne; onBeauftragen: () => void }) {
  const { totalschaden } = spanne

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

          {/* Stabile Reihenfolge: Reparatur-Weg zuerst (wenn vorhanden), dann Totalschaden-Weg */}
          {[totalschaden.reparaturWeg, totalschaden.totalschadenWeg]
            .filter((weg): weg is AnspruchWeg => weg !== null)
            .map((weg) => {
              const istReparaturWeg = weg === totalschaden.reparaturWeg
              return (
                <div key={weg.titel} className="space-y-1">
                  <AnspruchPositionsListe
                    spanne={wegZuSpanne(weg)}
                    titel={weg.titel}
                    gesamtLabel="Summe"
                    disclaimer=""
                  />
                  {istReparaturWeg && totalschaden.hinweisReparatur ? (
                    <p className="text-caption text-claimondo-shield">{totalschaden.hinweisReparatur}</p>
                  ) : null}
                </div>
              )
            })}

          <p className="text-caption text-claimondo-shield">
            Unverbindliche Ersteinschätzung anhand Ihrer Fotos. Den verbindlichen Anspruch ermittelt Ihr Gutachter.
          </p>
        </div>
      ) : (
        <AnspruchPositionsListe spanne={spanne} />
      )}

      <div className="rounded-ios-md bg-claimondo-bg p-3">
        <p className="text-body-sm font-medium text-claimondo-navy">Kasko-Fall? Versicherungsschein bereithalten.</p>
        <p className="mt-0.5 text-caption text-claimondo-shield">
          Bei selbst verursachtem Schaden regulieren Sie über Ihre eigene Kasko. Bei einem unverschuldeten Unfall zahlt die gegnerische Versicherung.
        </p>
      </div>

      <Button onClick={onBeauftragen} className="w-full">Gutachter beauftragen</Button>
    </div>
  )
}
