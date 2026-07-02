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
export const KFZ_RELEVANCE_TERMS: string[] = [
    '\\bkfz\\b',
    '\\bautos?\\b', // auto, autos — NICHT automatisch, autonom
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
    '\\bkasko\\w*', // deckt Kasko/Teilkasko/Vollkasko/Kaskoschaden ab
    '\\bschadenregulier\\w*',
    // Entfernt (E2E-Diagnostik 02.07., FP-Rate gg. KI-Ground-Truth): 'versicher\\w*' (91% FP —
    // Versicherungs-Feeds sind fast nur Nicht-Kfz Leben/Rente/Makler), 'autohaus\\w*' (80% FP —
    // Haendler-Business != Schaden), 'haftpflicht\\w*' (100% FP — allg. Haftpflicht). Echte
    // Kfz-Versicherungs-/Kasko-/Haftpflicht-Schaeden matchen weiter via kfz/kasko/unfall/schaden-Komposita.
    '\\bmietwagen\\b',
    '\\bdekra\\b',
    '\\bgtü\\b',
    '\\bküs\\b',
    '\\btüv\\b',
    '\\baudatex\\b',
    '\\bdat\\b', // Deutsche Automobil Treuhand — kurz, daher hard-bounded
    '\\bhuk\\b', // HUK-Coburg — kurz, daher hard-bounded
]

const KFZ_RELEVANCE_REGEX = new RegExp(KFZ_RELEVANCE_TERMS.join('|'), 'i')

// AUSSCHLUSS-Terme (E2E-Diagnostik 02.07.): klar themenfremde Motorsport-/Renn-/Event-/
// Sponsoring-News, die zwar einen Kfz-Anker (kfz, fahrzeug, küs) enthalten, aber nichts mit
// Schadenregulierung/Gutachten zu tun haben. Die KÜS-/Hersteller-Feeds sind voll davon
// (KÜS ist Titelpartner des Manthey-Rennteams). Ein Treffer hier -> sofort irrelevant.
export const KFZ_EXCLUSION_TERMS: string[] = [
  '\\brennsport\\w*',
  '\\bmotorsport\\w*',
  '\\brennstrecke\\w*',
  '\\brennwagen\\w*',
  '\\blausitzring\\b',
  '\\bzandvoort\\b',
  '\\bnürburgring\\b',
  '\\bhockenheim\\w*',
  '\\bdtm\\b',
  '\\bformel\\s?[1-4e]\\b',
  '\\bpodium\\b',
  '\\bqualifying\\b',
  '\\bpole[- ]?position\\b',
  '\\bspecial olympics\\b',
  '\\bmanthey\\b', // KÜS-Rennteam-Partner — dominiert den KÜS-Feed
  '\\bunfallversicher\\w*', // Personen-Unfallversicherung (Versicherungs-Feeds) != Kfz-Unfall
]
const KFZ_EXCLUSION_REGEX = new RegExp(KFZ_EXCLUSION_TERMS.join('|'), 'i')

/**
 * Gibt true zurueck wenn Titel+Summary mindestens einen Kfz-Schaden-Fachbegriff enthalten
 * UND keinen Ausschluss-Term (Motorsport/Event). Ist die grobe Vorfilterung; die feine
 * Relevanz-Entscheidung trifft der KI-Backstop im B2B-Prompt (NICHT_RELEVANT).
 */
export function isRelevantB2B(item: { title: string; summary: string }): boolean {
  const text = `${item.title} ${item.summary}`
  if (KFZ_EXCLUSION_REGEX.test(text)) return false
  return KFZ_RELEVANCE_REGEX.test(text)
}
