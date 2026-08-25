import { ladeWerkstattAbdeckung } from '@/lib/termine/werkstatt-abdeckung'

// Partner-Werkstätten einer Stadt — als echtes, server-gerendertes HTML.
//
// Zweck: den zweiten Weg sichtbar machen. Nach dem Gutachten braucht der Kunde eine
// Werkstatt; bei selbstverschuldetem Schaden ist sie sogar der ERSTE Schritt. Bis
// hierher stand davon nichts im HTML — `/werkstatt-finden` liefert 132 KB ohne eine
// einzige konkrete Angabe (alles im cross-origin-iframe), und die Stadtseiten nannten
// „Werkstatt" nur beiläufig.
//
// ⚠⚠ KEINE NAMEN, KEINE ADRESSEN, KEINE RUFNUMMERN. Die öffentliche Werkstatt-API gibt
// sie bewusst nicht aus — das ist der Geschäftskern, nicht nur Datenschutz: Wer eine
// Werkstatt will, geht über uns. Dieser Block zeigt deshalb nur Anzahl, Typ-Mischung
// und Bewertungsschnitt.
//
// Anders als beim Gutachter-Block steht hier KEIN Termin: Werkstätten werden vermittelt,
// nicht terminiert. Die Aussage ist Abdeckung, nicht Verfügbarkeit — und genau so ist
// sie formuliert, damit kein Modell daraus einen buchbaren Slot macht.

export async function WerkstattAbdeckungHinweis({ stadt }: { stadt: string }) {
  const w = await ladeWerkstattAbdeckung(stadt)
  if (!w) return null

  const marken = w.anzahl - w.freie
  // Singular/Plural sauber: „1 Betriebe" oder „1 freie Fachwerkstätten" wäre in einem
  // deutschen Produkt ein Fehler — und Städte mit genau einem Partner sind der Normalfall,
  // nicht die Ausnahme (gemessen 25.08.: Köln 17, Bremerhaven 2, Berlin 1).
  const freieText = w.freie === 1 ? 'eine freie Fachwerkstatt' : `${w.freie} freie Fachwerkstätten`
  const markenText = marken === 1 ? 'ein Markenbetrieb' : `${marken} Markenbetriebe`
  const mischung =
    w.freie > 0 && marken > 0 ? `${freieText} und ${markenText}` : w.freie > 0 ? freieText : markenText

  return (
    <div className="mt-4 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
      <p className="text-caption font-bold uppercase tracking-wide text-claimondo-shield/70">
        Partner-Werkstätten in {stadt}
      </p>
      <p className="mt-1 text-heading-sm font-bold text-claimondo-navy">
        {w.anzahl === 1 ? 'Ein Betrieb im Umkreis' : `${w.anzahl} Betriebe im Umkreis`}
      </p>
      <p className="mt-1 text-body-sm text-claimondo-shield">
        {mischung}
        {w.schnitt != null
          ? ` · ø ${w.schnitt.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}★`
          : ''}
      </p>
      <p className="mt-2 text-body-sm text-claimondo-shield">
        Nach dem Gutachten übernimmt eine Partner-Werkstatt die Reparatur. Bei unverschuldetem
        Schaden zahlt die gegnerische Haftpflicht; bei selbstverschuldetem Schaden ist die
        Werkstatt der erste Schritt — mit Vollkasko reguliert Ihre eigene Versicherung.
      </p>
      {/* EIN Textknoten — sonst setzt React einen `<!-- -->`-Trenner zwischen Satz und
          URL und ein Extraktor kann beides auseinanderreissen. Siehe die ausfuehrliche
          Begruendung in NaechsterTerminHinweis.tsx. */}
      <p className="mt-3 break-all text-body-xs text-claimondo-shield/60">
        {`Werkstatt-Finder: ${w.finderUrl}`}
      </p>
      <a
        href={w.finderUrl}
        className="mt-3 inline-flex items-center gap-2 rounded-ios-sm border border-claimondo-navy px-5 py-2.5 text-body-sm font-bold text-claimondo-navy transition-colors hover:bg-claimondo-navy hover:text-white"
      >
        Werkstatt in {stadt} finden
      </a>
    </div>
  )
}
