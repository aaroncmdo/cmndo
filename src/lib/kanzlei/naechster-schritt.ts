// KB-Fakt-getriebene Kanzlei-Strecke — „Was fehlt fuer die naechste Phase?" (Inverse der Ableitung).
//
// Aaron 29.06.: KB UND Admin sollen IMMER aufgefordert werden, die fuer den naechsten
// Phasen-Schritt fehlenden Daten im Claim einzutragen. Weil die Phase aus Fakten abgeleitet
// wird (computeNextOperativePhase), weiss das System exakt, welcher Fakt als Naechstes fehlt.
// Diese Funktion liefert genau diesen naechsten KB-Schritt — rein, unit-testbar.
//
// Hinweis: nur fuer die KB-getriebenen Phasen (filmcheck + Kanzlei-Strecke). Im SV-Track
// (ersterfassung..gutachten-eingegangen) liegt das „fehlende Datum" beim SV/Dispatch, nicht
// beim KB -> null.

import type { KanzleiFaktKey } from './fakt-mapping'

export type KanzleiNaechsterSchritt = {
  /** der einzutragende Fakt — oder 'qc' (Filmcheck/QC ist eine eigene KB-Aktion, kein Fakt) */
  faktKey: KanzleiFaktKey | 'qc'
  titel: string
  hinweis: string
}

export function naechsterKanzleiSchritt(status: string | null): KanzleiNaechsterSchritt | null {
  switch (status) {
    case 'filmcheck':
      return {
        faktKey: 'qc',
        titel: 'Filmcheck / QC durchführen',
        hinweis: 'Gutachten prüfen und an die Kanzlei übergeben.',
      }
    case 'kanzlei-uebergeben':
      return {
        faktKey: 'anschlussschreiben',
        titel: 'Anschlussschreiben erfassen',
        hinweis: 'Wann ging das Anspruchsschreiben an die gegnerische Versicherung raus?',
      }
    case 'anschlussschreiben':
      return {
        faktKey: 'vs_reaktion',
        titel: 'VS-Reaktion erfassen',
        hinweis: 'Wie hat die gegnerische Versicherung reagiert — voll reguliert, gekürzt oder abgelehnt?',
      }
    case 'vs-kuerzt':
      return {
        faktKey: 'regulierung',
        titel: 'Regulierung oder Klage erfassen',
        hinweis: 'Wurde der gekürzte Betrag reguliert — oder geht der Fall in die Klage?',
      }
    case 'vs-abgelehnt':
      return {
        faktKey: 'klage',
        titel: 'Klage erfassen',
        hinweis: 'Die Versicherung hat abgelehnt — wurde Klage eingereicht?',
      }
    case 'regulierung':
    case 'regulierung-laeuft':
      return {
        faktKey: 'zahlung',
        titel: 'Zahlungseingang erfassen',
        hinweis: 'Ist die Zahlung der gegnerischen Versicherung eingegangen?',
      }
    case 'klage':
    case 'zahlung-eingegangen':
      return {
        faktKey: 'abschluss',
        titel: 'Fall abschließen',
        hinweis: 'Ist der Fall vollständig abgewickelt und kann abgeschlossen werden?',
      }
    default:
      return null
  }
}
