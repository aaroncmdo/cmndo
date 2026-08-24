import ROH from './stadt-verkehrsmengen.json'

// Verkehrsmengen auf Bundesfernstraßen — Bundesanstalt für Straßenwesen
// (BASt), automatische Dauerzählstellen, Jahresauswertung 2024.
//
// WARUM DAS HIER STEHT: Die Unfallhäufungen (Unfallatlas) sagen, WO es kracht
// — aber nicht, wie viel Verkehr dort überhaupt unterwegs ist. Die
// Verkehrsmenge ist der Kontext dazu und der einzige harte Ortsfakt, der
// erklärt, warum eine Hauptachse mehr Unfälle trägt als eine Nebenstraße.
// Der Schwerverkehrsanteil beziffert zusätzlich das Lkw-Risiko — ein
// Kern-Gutachterthema.
//
// Erzeugt von scripts/generate-stadt-verkehrsmengen.mjs (jährlich).

export type Zaehlstelle = {
  /** „A3", „B51" — Straßenklasse + Nummer. */
  strasse: string
  /** Name der Zählstelle laut BASt, z. B. „Leverkusen". */
  name: string
  /**
   * Luftlinie zum Stadtzentrum.
   *
   * ⚠ Gehört IMMER in die Aussage. Zählstellen liegen bis zu 10 km entfernt;
   * „auf der A3 bei Hürth" wäre bei 9 km Abstand geschönt. Mit der Entfernung
   * daneben ist die Angabe überprüfbar statt ungefähr.
   */
  entfernungKm: number
  fahrzeugeProTag: number
  /** Lkw und Busse. 0 = nicht gesondert gemessen, nicht „keine". */
  schwerverkehrProTag: number
}

export type StadtVerkehrsmengen = {
  jahr: number
  quelle: string
  lizenz: string
  zaehlstellen: Zaehlstelle[]
}

const DATEN = ROH as Record<string, StadtVerkehrsmengen>

export function getVerkehrsmengen(slug: string): StadtVerkehrsmengen | null {
  return DATEN[slug] ?? null
}

/** Schwerverkehrsanteil in Prozent — `null`, wenn nicht gesondert gemessen. */
export function schwerverkehrAnteil(z: Zaehlstelle): number | null {
  if (z.schwerverkehrProTag <= 0 || z.fahrzeugeProTag <= 0) return null
  return Math.round((z.schwerverkehrProTag / z.fahrzeugeProTag) * 100)
}

/**
 * Der Faktensatz zu einer Zählstelle.
 *
 * ⚠ Wie bei den Unfallzahlen: eine Messung, keine Wertung. „Hier fahren
 * täglich 171.135 Fahrzeuge" ist belegbar; „hier ist viel los" oder gar „hier
 * passiert deshalb mehr" wäre eine Deutung, die die Daten nicht tragen.
 *
 * @param locale für die Tausendertrennung — hartcodiertes 'de-DE' wäre auf
 *   fünf von sechs Sprachversionen falsch.
 */
export function zaehlstelleSatz(z: Zaehlstelle, locale: string): string {
  const n = (v: number) => v.toLocaleString(locale)
  const anteil = schwerverkehrAnteil(z)
  const kern = `${n(z.fahrzeugeProTag)} Fahrzeuge pro Tag`
  return anteil === null
    ? `${kern}.`
    : `${kern}, darunter ${n(z.schwerverkehrProTag)} Lkw und Busse (${anteil} %).`
}
