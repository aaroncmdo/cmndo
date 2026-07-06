import { AnspruchPositionsListe } from '@/components/shared/AnspruchPositionsListe'
import type { AnspruchSpanne, AnspruchWeg, Schuldform, TotalschadenInfo } from '@/lib/anspruch/types'

/** Adapter: baut aus einem AnspruchWeg eine minimale AnspruchSpanne für AnspruchPositionsListe.
 *  Reicht die Schuldform durch, damit die Positionsliste je Fall verzweigt (z. B. Kasko statt Gegner). */
function wegZuSpanne(weg: AnspruchWeg, schuld: Schuldform): AnspruchSpanne {
  return { positionen: weg.positionen, gesamtMinEur: weg.summeMinEur, gesamtMaxEur: weg.summeMaxEur, hinweise: [], schuld }
}

/** Rendert die zwei Totalschaden-Wege (Reparatur zuerst, dann Totalschaden) als je eine
 *  AnspruchPositionsListe mit Titel; 130%-Hinweis unter dem Reparatur-Weg. Wiederverwendet
 *  im Kunden-Summary und in der SV-Fallakte. Die Schuldform steuert das Framing beider Wege. */
export function AnspruchTotalschadenWege({ totalschaden, schuld }: { totalschaden: TotalschadenInfo; schuld: Schuldform }) {
  return (
    <>
      {[totalschaden.reparaturWeg, totalschaden.totalschadenWeg]
        .filter((weg): weg is AnspruchWeg => weg !== null)
        .map((weg) => {
          const istReparaturWeg = weg === totalschaden.reparaturWeg
          return (
            <div key={weg.titel} className="space-y-1">
              <AnspruchPositionsListe spanne={wegZuSpanne(weg, schuld)} titel={weg.titel} gesamtLabel="Summe" disclaimer="" />
              {istReparaturWeg && totalschaden.hinweisReparatur ? (
                <p className="text-caption text-claimondo-shield">{totalschaden.hinweisReparatur}</p>
              ) : null}
            </div>
          )
        })}
    </>
  )
}
