// Welche Staedte eine Ratgeber-Seite verlinkt — die REGEL, ohne Datenbindung.
//
// Warum pures .mjs statt TypeScript: dieselbe Begruendung wie bei
// nachbar-auswahl.mjs. Die Regel hat zwei Consumer in zwei Builds, die keinen
// gemeinsamen TS-Pfad haben — die Seite (claimondo-marketing, TS) und das
// Pruefskript (scripts/, .mjs). Lebte sie nur im TS-Modul, muesste das Skript
// sie nachbauen, und beide liefen auseinander. Genau das ist in dieser Lane
// zweimal passiert: der Datenmodus meldete Waisen, die auf der Seite laengst
// verlinkt waren, und nach dem A2-Merge unveraenderte Zahlen. Ein Messwerkzeug,
// das die Regel nachbaut, misst frueher oder spaeter etwas anderes als die
// Seite rendert.
//
// Typen kommen ueber JSDoc; `allowJs` in der Marketing-tsconfig laesst den
// TS-Wrapper das Modul importieren, ohne die Typsicherheit aufzugeben.

import { einwohnerZahl } from './nachbar-auswahl.mjs'

/** Die Ratgeber-Geschwister unter /kfz-gutachter/. Bewusst eine Konstante und
 *  nicht aus dem Dateisystem gelesen: das Modul laeuft auch im Client-Bundle.
 *  Ein Test sichert ab, dass keiner dieser Slugs eine Stadt ist. */
export const RATGEBER_SEITEN = [
  'ablauf',
  'kosten',
  'wertminderung',
  'nutzungsausfall',
  'gutachten-service',
  'online-kfz-gutachten',
  'sachverstaendiger-vs-gutachter',
  'vermittlungsportale-vergleich',
  'autoschaden-soforthilfe',
]

/** Stabiler Streuwert aus dem Artikel-Slug. Kein Zufall: die Auswahl muss
 *  zwischen zwei Deploys identisch bleiben, sonst wackelt das Linknetz.
 *  @param {string} text */
function streuwert(text) {
  let wert = 0
  for (let i = 0; i < text.length; i++) wert = (wert * 31 + text.charCodeAt(i)) >>> 0
  return wert
}

/**
 * @typedef {{ slug: string, bevoelkerung: string }} StadtBasis
 */

/**
 * Die Staedte, die eine Ratgeber-Seite verlinkt.
 *
 * Genommen wird jede `schritt`-te Stadt der nach Groesse sortierten Liste, mit
 * einem aus der Position der Seite abgeleiteten Startversatz. Das hat zwei
 * Effekte, die eine simple "die N groessten"-Liste nicht haette: die Auswahl
 * unterscheidet sich je Seite (sonst waere es eine globale Kante ohne
 * thematisches Signal, genau wie der Footer-Strip), und jede Auswahl mischt
 * grosse mit kleineren Staedten — die kleinen brauchen die eingehenden Links am
 * dringendsten, die grossen machen die Liste fuer Leser brauchbar.
 *
 * Der Versatz ist die POSITION der Seite, nicht ein Hash. Das ist kein Detail:
 * bei Schrittweite 12 sind die Versaetze 0…8 fast disjunkte Restklassen, die
 * Auswahlen ueberlappen also kaum. Gemessen ueber alle neun Seiten: Index-
 * Versatz deckte 71 der damals 92 Staedte ab, ein Hash-Versatz nur 52 — bei
 * identischem Aufwand. Ein unbekannter Slug faellt auf den Hash zurueck, damit
 * die Funktion auch ausserhalb der Liste definiert bleibt.
 *
 * @template {StadtBasis} T
 * @param {string} artikelSlug
 * @param {readonly T[]} staedte
 * @param {number} [anzahl]
 * @returns {T[]}
 */
export function waehleRatgeberStaedte(artikelSlug, staedte, anzahl = 8) {
  if (anzahl <= 0) return []

  const nachGroesse = [...staedte].sort(
    (a, b) => einwohnerZahl(b.bevoelkerung) - einwohnerZahl(a.bevoelkerung) || a.slug.localeCompare(b.slug),
  )
  if (anzahl >= nachGroesse.length) return nachGroesse

  const schritt = Math.ceil(nachGroesse.length / anzahl)
  const position = RATGEBER_SEITEN.indexOf(artikelSlug)
  const versatz = position >= 0 ? position : streuwert(artikelSlug) % nachGroesse.length

  const auswahl = []
  for (let i = 0; auswahl.length < anzahl; i++) {
    const index = (versatz + i * schritt) % nachGroesse.length
    const stadt = nachGroesse[index]
    if (!auswahl.includes(stadt)) auswahl.push(stadt)
    // Reissleine: bei ungluecklichen Schrittweiten koennte der Ringlauf
    // Positionen wiederholen, bevor `anzahl` voll ist.
    if (i > nachGroesse.length * 2) break
  }
  return auswahl
}
