import { AnspruchPositionsListe } from '@/components/shared/AnspruchPositionsListe'
import { AnspruchTotalschadenWege } from '@/components/shared/AnspruchTotalschadenWege'
import { SEGMENT_LABEL } from '@/lib/anspruch/types'
import type { AnspruchVorschau } from '@/lib/anspruch/get-anspruch-vorschau-fuer-fall'

/**
 * SV-Fallakte: read-only Karte mit der KI-Vorschätzung des Kunden (Anspruch-pruefen-Tool).
 * Rein präsentational; Daten kommen server-seitig aus getAnspruchVorschauFuerFall.
 */
export function AnspruchVorschauCard({ vorschau }: { vorschau: AnspruchVorschau }) {
  const segLabel = vorschau.segment
    ? (SEGMENT_LABEL as Record<string, string>)[vorschau.segment] ?? vorschau.segment
    : null

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-claimondo-bg p-4">
      <h3 className="text-heading-sm font-bold text-claimondo-navy">KI-Vorschätzung des Kunden</h3>
      <p className="mt-1 text-caption text-claimondo-shield">
        Automatische Ersteinschätzung aus den vom Kunden hochgeladenen Schadenfotos. Unverbindlich, ersetzt nicht Ihr Gutachten.
      </p>

      <div className="mt-3 space-y-1 text-body-sm text-claimondo-navy">
        {vorschau.beschaedigteTeile.length > 0 && (
          <p><span className="text-claimondo-shield">Erkannte Teile: </span>{vorschau.beschaedigteTeile.join(', ')}</p>
        )}
        {vorschau.schweregrad && (
          <p><span className="text-claimondo-shield">Schweregrad: </span>{vorschau.schweregrad}</p>
        )}
        {segLabel && (
          <p><span className="text-claimondo-shield">Fahrzeugklasse: </span>{segLabel}</p>
        )}
        {vorschau.fahrbereit != null && (
          <p><span className="text-claimondo-shield">Fahrbereit: </span>{vorschau.fahrbereit ? 'ja' : 'nein'}</p>
        )}
        {vorschau.ezJahr != null && (
          <p><span className="text-claimondo-shield">Erstzulassung: </span>{vorschau.ezJahr}</p>
        )}
        {vorschau.beschreibung && (
          <p className="pt-1 text-caption text-claimondo-shield">{vorschau.beschreibung}</p>
        )}
      </div>

      {vorschau.spanne.totalschaden ? (
        <div className="mt-3 space-y-3">
          <p className="text-body-sm text-claimondo-shield">
            Möglicher wirtschaftlicher Totalschaden. Der Kunde hat zwei Wege:
          </p>
          <AnspruchTotalschadenWege totalschaden={vorschau.spanne.totalschaden} schuld={vorschau.spanne.schuld} />
          <p className="text-caption text-claimondo-shield">
            Vom System erzeugte KI-Ersteinschätzung des Kunden. Unverbindlich, ersetzt nicht Ihr Gutachten.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <AnspruchPositionsListe
            spanne={vorschau.spanne}
            gesamtLabel="Möglicher Anspruch des Kunden"
            disclaimer="Vom System erzeugte KI-Ersteinschätzung des Kunden. Unverbindlich, ersetzt nicht Ihr Gutachten."
          />
        </div>
      )}
    </div>
  )
}
