'use client'
import type { AnspruchSpanne, AnspruchWeg } from '@/lib/anspruch/types'
import { AnspruchPositionsListe } from '@/components/shared/AnspruchPositionsListe'
import { Button, Badge } from '@/components/primitives'

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
    <div className="space-y-4">
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
            vor. Ihre Optionen:
          </p>

          {/* Wege in der Reihenfolge: guenstiger zuerst */}
          {[
            totalschaden.guenstiger === 'totalschaden' ? totalschaden.totalschadenWeg : totalschaden.reparaturWeg,
            totalschaden.guenstiger === 'totalschaden' ? totalschaden.reparaturWeg : totalschaden.totalschadenWeg,
          ]
            .filter((weg): weg is AnspruchWeg => weg !== null)
            .map((weg) => {
              const istGuenstiger =
                (totalschaden.guenstiger === 'totalschaden' && weg === totalschaden.totalschadenWeg) ||
                (totalschaden.guenstiger === 'reparatur' && weg === totalschaden.reparaturWeg)
              return (
                <div key={weg.titel} className="space-y-1">
                  {istGuenstiger ? (
                    <div className="flex items-center gap-2">
                      <Badge tone="success">günstiger für Sie</Badge>
                    </div>
                  ) : null}
                  <AnspruchPositionsListe
                    spanne={wegZuSpanne(weg)}
                    titel={weg.titel}
                    gesamtLabel="Summe"
                  />
                </div>
              )
            })}
        </div>
      ) : (
        <AnspruchPositionsListe spanne={spanne} />
      )}

      <Button onClick={onBeauftragen} className="w-full">Gutachter beauftragen</Button>
    </div>
  )
}
