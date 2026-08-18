import { STAEDTE, type Stadt } from './staedte'
import { RATGEBER_SEITEN as SEITEN, waehleRatgeberStaedte } from './ratgeber-auswahl.mjs'

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
// WAS STATTDESSEN PASSIERT: eine deterministische VERTEILUNG. Die Regel selbst
// liegt seit 18.08.2026 in `ratgeber-auswahl.mjs` — sie hat zwei Consumer in
// zwei Builds ohne gemeinsamen TS-Pfad (diese Seite und das Linknetz-Skript),
// und ein Skript, das die Regel nachbaut, misst frueher oder spaeter etwas
// anderes als die Seite rendert. Dieses Modul bindet sie nur noch an STAEDTE.

/** Unveraendert re-exportiert, damit die Import-Pfade der Consumer bleiben. */
export const RATGEBER_SEITEN = SEITEN

/**
 * Die Staedte, die eine Ratgeber-Seite verlinkt. Regel siehe
 * `ratgeber-auswahl.mjs`; hier wird nur der Bestand eingesetzt.
 */
export function staedteFuerRatgeber(artikelSlug: string, anzahl = 8): Stadt[] {
  return waehleRatgeberStaedte(artikelSlug, STAEDTE, anzahl)
}
