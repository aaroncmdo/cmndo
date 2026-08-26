/**
 * Die waehlbaren Schadenarten des Finders — geteilt zwischen Wizard (Client) und
 * Deeplink-Auswertung (Server).
 *
 * Bewusst ein eigenes Modul statt eines Imports aus `FinderWizard.tsx`: die Datei traegt
 * `'use client'`, und eine Server-Component sollte nicht an einem Client-Bundle haengen,
 * nur um eine Liste von fuenf Strings zu lesen.
 *
 * Die Reihenfolge ist die Anzeigereihenfolge im Wizard und zugleich die Menge, gegen die
 * ein `?schadenart=`-Parameter validiert wird. Ein Wert, der hier nicht steht, wird
 * verworfen — der Wert landet als `notiz` am Lead, Freitext aus einer URL hat dort
 * nichts zu suchen.
 */
export const SCHADEN_OPTIONEN = [
  'Auffahrunfall',
  'Parkschaden',
  'Spurwechsel',
  'Vorfahrtsverletzung',
  'Sonstiger Schaden',
] as const

export type Schadenart = (typeof SCHADEN_OPTIONEN)[number]
