/**
 * Relevanz-Filter fuer den B2B-Content-Crawler.
 *
 * Verhindert, dass themenfremde Meldungen (Medienrecht, Steuern, allg. Politik)
 * automatisch als Wissen-Themen angelegt werden.
 *
 * Pure function — kein IO, kein State, direkt unit-testbar.
 */

// Einmaliger Compile: OR-Pattern mit Word-Boundaries gegen FP.
// Kurze / mehrdeutige Terme (auto, dat, huk) werden hart begrenzt (\b...\b).
// Inflektionsoffene Terme nutzen Stamm + \w* (z.B. schaden\w* trifft Schaden, Schadens, Schadenfall).
const KFZ_RELEVANCE_REGEX = new RegExp(
  [
    '\\bkfz\\b',
    '\\bautos?\\b', // auto, autos — NICHT automatisch, autonom
    '\\bautohaus\\b',
    '\\bautomobil\\w*',
    '\\bfahrzeug\\w*',
    '\\bpkw\\b',
    '\\bunfall\\w*',
    '\\bschaden\\w*', // Schaden, Schadensfall, Schadenregulierung
    '\\bschäden\\b',
    '\\bgutacht\\w*', // Gutachten, Gutachter
    '\\bsachverständ\\w*',
    '\\bwerkstatt\\b',
    '\\bwerkstätten\\b',
    '\\breparatur\\w*',
    '\\bversicher\\w*', // Versicherer, Versicherung
    '\\bhaftpflicht\\b',
    '\\bkasko\\b',
    '\\bwertminderung\\b',
    '\\bnutzungsausfall\\b',
    '\\brestwert\\b',
    '\\bmietwagen\\b',
    '\\bkarosserie\\b',
    '\\bdekra\\b',
    '\\bgtü\\b',
    '\\bküs\\b',
    '\\btüv\\b',
    '\\bverkehr\\w*', // Verkehrsrecht, Verkehrsunfall
    '\\bschadenregulier\\w*', // Schadenregulierung, Schadenregulierer — nicht allg. "Regulierung"
    '\\baudatex\\b',
    '\\bdat\\b', // Deutsche Automobil Treuhand — kurz, daher hard-bounded
    '\\bhuk\\b', // HUK-Coburg — kurz, daher hard-bounded
  ].join('|'),
  'i',
)

/**
 * Gibt true zurueck wenn Titel+Summary mindestens einen Kfz-/Schaden-/
 * Versicherungs-Fachbegriff enthalten und das Item damit fuer die
 * B2B-Content-Pipeline relevant ist.
 */
export function isRelevantB2B(item: { title: string; summary: string }): boolean {
  const text = `${item.title} ${item.summary}`
  return KFZ_RELEVANCE_REGEX.test(text)
}
