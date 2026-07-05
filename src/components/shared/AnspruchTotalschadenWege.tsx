import { AnspruchPositionsListe } from '@/components/shared/AnspruchPositionsListe'
import type { AnspruchSpanne, AnspruchWeg, TotalschadenInfo } from '@/lib/anspruch/types'

/** Adapter: baut aus einem AnspruchWeg eine minimale AnspruchSpanne für AnspruchPositionsListe */
function wegZuSpanne(weg: AnspruchWeg): AnspruchSpanne {
  return { positionen: weg.positionen, gesamtMinEur: weg.summeMinEur, gesamtMaxEur: weg.summeMaxEur, hinweise: [] }
}

/** Rendert die zwei Totalschaden-Wege (Reparatur zuerst, dann Totalschaden) als je eine
 *  AnspruchPositionsListe mit Titel; 130%-Hinweis unter dem Reparatur-Weg. Wiederverwendet
 *  im Kunden-Summary und in der SV-Fallakte. */
export function AnspruchTotalschadenWege({ totalschaden }: { totalschaden: TotalschadenInfo }) {
  return (
    <>
      {[totalschaden.reparaturWeg, totalschaden.totalschadenWeg]
        .filter((weg): weg is AnspruchWeg => weg !== null)
        .map((weg) => {
          const istReparaturWeg = weg === totalschaden.reparaturWeg
          return (
            <div key={weg.titel} className="space-y-1">
              <AnspruchPositionsListe spanne={wegZuSpanne(weg)} titel={weg.titel} gesamtLabel="Summe" disclaimer="" />
              {istReparaturWeg && totalschaden.hinweisReparatur ? (
                <p className="text-caption text-claimondo-shield">{totalschaden.hinweisReparatur}</p>
              ) : null}
            </div>
          )
        })}
    </>
  )
}
