import { STAEDTE, type Stadt } from './staedte'

// Stadt-Querverweise fuer die Ratgeber-Seiten unter /kfz-gutachter/.
//
// DER BEFUND, DER DAZU FUEHRTE: Die Ratgeber-Seiten verlinkten
// **keine einzige Stadt**. Gemessen 17.08.2026 ueber alle neun Geschwister —
// die Treffer, die eine erste Zaehlung fand, waren Links auf ANDERE Ratgeber,
// nicht auf Stadtseiten. Damit endete jede thematische Seite in sich selbst,
// obwohl sie das naheliegende Sprungbrett in die lokale Flaeche waere.
//
// WAS DIE SPEC WOLLTE UND WARUM ES SO NICHT GEHT: §A4 schlug vor, Staedte zu
// zeigen, "fuer die der Artikel besonders einschlaegig ist". Ein solches
// Kriterium gibt es nicht: Wertminderung, Nutzungsausfall und Ablauf gelten in
// Koeln wie in Bocholt. Wer trotzdem eine inhaltliche Zuordnung behauptet,
// erfindet sie — dieselbe Klasse wie die 473 behaupteten Partner-SVs, die im
// August entfernt wurden.
//
// WAS STATTDESSEN PASSIERT: eine deterministische VERTEILUNG. Jede Ratgeber-
// Seite zeigt eine andere Teilmenge, sodass ueber alle Seiten moeglichst viele
// Staedte einen eingehenden Link aus thematischem Kontext bekommen. Der
// Ankertext ("Kfz-Gutachter Koeln") ist auf jeder Seite wahr — es wird nichts
// behauptet, nur verteilt. Zeigten alle Seiten dieselbe Liste, waere es eine
// globale Kante ohne Signal, genau wie der Footer-Strip.

/** Die Ratgeber-Geschwister unter /kfz-gutachter/ — bewusst als Konstante und
 *  nicht aus dem Dateisystem: dieses Modul laeuft im Client-Bundle. Die Liste
 *  ist per Test gegen die Stadt-Slugs abgesichert. */
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
] as const

/** Einwohnerzahl aus dem gepflegten Anzeigestring ("165 Tsd.", "3,7 Mio."). */
function einwohnerZahl(bevoelkerung: string): number {
  const treffer = bevoelkerung.match(/^\s*([\d.,]+)\s*(Tsd|Mio)/)
  if (!treffer) return 0
  const zahl = Number.parseFloat(treffer[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(zahl) ? zahl * (treffer[2] === 'Mio' ? 1_000_000 : 1_000) : 0
}

/** Stabiler Streuwert aus dem Artikel-Slug. Kein Zufall: die Auswahl muss
 *  zwischen zwei Deploys identisch bleiben, sonst wackelt das Linknetz. */
function streuwert(text: string): number {
  let wert = 0
  for (let i = 0; i < text.length; i++) wert = (wert * 31 + text.charCodeAt(i)) >>> 0
  return wert
}

/** Nach Einwohnerzahl absteigend, Tie-Break ueber den slug. Einmal berechnet —
 *  STAEDTE ist zur Laufzeit konstant. */
const nachGroesse: readonly Stadt[] = [...STAEDTE].sort(
  (a, b) => einwohnerZahl(b.bevoelkerung) - einwohnerZahl(a.bevoelkerung) || a.slug.localeCompare(b.slug),
)

/**
 * Die Staedte, die eine Ratgeber-Seite verlinkt.
 *
 * Genommen wird jede `schritt`-te Stadt der nach Groesse sortierten Liste, mit
 * einem aus dem Slug abgeleiteten Startversatz. Das hat zwei Effekte, die eine
 * simple "die N groessten"-Liste nicht haette: die Auswahl unterscheidet sich je
 * Seite (sonst waere es eine globale Kante), und jede Auswahl mischt grosse mit
 * kleineren Staedten — die kleinen brauchen die eingehenden Links am dringendsten,
 * die grossen machen die Liste fuer Leser brauchbar.
 */
export function staedteFuerRatgeber(artikelSlug: string, anzahl = 8): Stadt[] {
  if (anzahl <= 0) return []
  if (anzahl >= nachGroesse.length) return [...nachGroesse]

  const schritt = Math.ceil(nachGroesse.length / anzahl)

  // Der Versatz ist die POSITION der Seite in RATGEBER_SEITEN, nicht ein Hash.
  // Das ist kein Detail: bei Schrittweite 12 sind die Versaetze 0…8 fast
  // disjunkte Restklassen, die Auswahlen ueberlappen also kaum. Gemessen ueber
  // alle neun Seiten: Index-Versatz deckt 71 der 92 Staedte ab, ein Hash-Versatz
  // nur 52 — bei identischem Aufwand. Ein unbekannter Slug faellt auf den Hash
  // zurueck, damit die Funktion auch ausserhalb der Liste definiert bleibt.
  const position = RATGEBER_SEITEN.indexOf(artikelSlug as (typeof RATGEBER_SEITEN)[number])
  const versatz = position >= 0 ? position : streuwert(artikelSlug) % nachGroesse.length

  const auswahl: Stadt[] = []
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
