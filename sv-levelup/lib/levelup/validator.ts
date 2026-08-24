import type { Befund, Fehlstelle } from './modul-vertrag'

export type PruefErgebnis = {
  gueltig: Befund[]
  fehlstellen: Fehlstelle[]
  istPunkte: number
  maxPunkte: number
}

/**
 * Setzt R-A und R-B durch, BEVOR ein Befund gespeichert wird.
 *
 * Der Validator ist die Stelle, an der die eisernen Regeln aus CONTEXT §8
 * technisch werden statt nur beschrieben zu sein:
 *
 *   R-A  Jeder Wert traegt Quelle und Erhebungszeitpunkt. Ohne beides ist eine
 *        Zahl eine Behauptung — sie wird verworfen und als Fehlstelle
 *        ausgewiesen, damit sichtbar bleibt, dass dort etwas fehlt.
 *   R-B  `wert: null` heisst „nicht erhoben" und braucht einen Grund. Eine
 *        stille Null saehe im Balkendiagramm aus wie ein gemessenes Null.
 *
 * Ein ungueltiger Befund bringt die anderen nicht zu Fall — sonst entschiede
 * ein kaputtes Kriterium ueber das ganze Modul.
 */
export function pruefeBefunde(befunde: Befund[]): PruefErgebnis {
  const gueltig: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  for (const b of befunde) {
    const grund = warumUngueltig(b)
    if (grund) fehlstellen.push({ schluessel: b.schluessel, grund })
    else gueltig.push(b)
  }

  return {
    gueltig,
    fehlstellen,
    istPunkte: gueltig.reduce((s, b) => s + b.punkte, 0),
    // ⚠ NUR die tatsaechlich erhobenen Kriterien zaehlen ins Maximum.
    //
    // Ein Kriterium mit `wert: null` wurde NICHT gemessen. Steht sein Maximum
    // trotzdem im Nenner, wird aus „nicht erhoben" faktisch „null Punkte" —
    // genau die Gleichsetzung, die R-B verbietet. Am 19.08. im Durchlauf
    // aufgefallen: derselbe Betrieb kam auf 47 % statt 71 %, weil die
    // Maxima ungemessener Kriterien mitzaehlten. Der Unterschied ist der
    // zwischen „mangelhaft" und „solide mit Luecken".
    maxPunkte: gueltig.reduce((s, b) => s + (b.wert === null ? 0 : b.maximum), 0),
  }
}

function warumUngueltig(b: Befund): string | null {
  if (!b.quelle?.trim()) return 'ohne Quelle erhoben — nach R-A nicht verwendbar'

  if (!b.erhoben?.trim()) return 'ohne Zeitpunkt erhoben — nach R-A nicht verwendbar'
  if (Number.isNaN(Date.parse(b.erhoben))) {
    return `Zeitpunkt „${b.erhoben}" ist kein gültiges Datum — nach R-A nicht verwendbar`
  }

  if (b.wert === null && !b.grund?.trim()) {
    return 'nicht erhoben, aber ohne grund — nach R-B nicht verwendbar'
  }
  // Entweder ein Wert ODER ein Nicht-Erhoben-Grund. Beides zugleich behauptet
  // eine Messung und ihr Ausbleiben.
  if (b.wert !== null && b.grund?.trim()) {
    return 'widersprüchlich: trägt einen Wert UND einen Nicht-Erhoben-Grund'
  }

  if (b.punkte < 0) return `negative Punkte (${b.punkte})`
  if (b.punkte > b.maximum) return `mehr Punkte als möglich (${b.punkte} von ${b.maximum})`

  return null
}
