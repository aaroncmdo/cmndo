/**
 * Relevanz-Filter fuer den B2B-Content-Crawler.
 *
 * Verhindert, dass themenfremde Meldungen (Medienrecht, Steuern, allg. Politik)
 * automatisch als Wissen-Themen angelegt werden.
 *
 * Pure function — kein IO, kein State, direkt unit-testbar.
 */

// Einmaliger Compile: OR-Pattern mit Word-Boundaries gegen FP.
// WICHTIG (E2E-Smoke 02.07.): die frueheren breiten Terme `verkehr\w*`, `gutacht\w*`
// und `schaden\w*` erzeugten False-Positives auf themenfremde Rechtsnews —
// "VERKEHRsverbot Wasserpfeifentabak" (Tabakrecht) und "GUTACHTerausschuss" (Immobilien-
// bewertung) wurden faelschlich als relevant eingestuft. Daher: NUR noch starke
// Kfz-Schaden-Anker; die generischen Rechtsbegriffe sind durch Kfz-spezifische Komposita
// ersetzt (verkehrsunfall/verkehrsrecht, schadengutacht, unfallschaden, schadenregulier).
// Zweite Sicherung ist der KI-Backstop im B2B-Prompt (NICHT_RELEVANT). Kurze/mehrdeutige
// Terme (auto, dat, huk) sind hart begrenzt (\b...\b).
const KFZ_RELEVANCE_REGEX = new RegExp(
  [
    '\\bkfz\\b',
    '\\bautos?\\b', // auto, autos — NICHT automatisch, autonom
    '\\bautohaus\\w*',
    '\\bautomobil\\w*',
    '\\bfahrzeug\\w*',
    '\\bpkw\\b',
    '\\blkw\\b',
    '\\bmotorrad\\w*',
    '\\bunfall\\w*', // Unfall, Unfallschaden, Unfallgutachten
    '\\bverkehrsunfall\\w*',
    '\\bverkehrsrecht\\w*',
    '\\bstvg\\b',
    '\\bkarosserie\\w*',
    '\\btotalschaden\\b',
    '\\bunfallschaden\\w*',
    '\\bwertminderung\\b',
    '\\bnutzungsausfall\\b',
    '\\brestwert\\w*',
    '\\bwiederbeschaffungswert\\w*',
    '\\bschadengutacht\\w*', // Schadengutachten — NICHT allg. "Gutachterausschuss"
    '\\bsachverständ\\w*',
    '\\bwerkstatt\\w*',
    '\\bwerkstätten\\b',
    '\\breparatur\\w*',
    '\\bkasko\\w*',
    '\\bhaftpflicht\\w*',
    '\\bversicher\\w*', // Versicherer/Versicherung — Versicherung ist eine gewaehlte Kategorie
    '\\bschadenregulier\\w*',
    '\\bmietwagen\\b',
    '\\bdekra\\b',
    '\\bgtü\\b',
    '\\bküs\\b',
    '\\btüv\\b',
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
