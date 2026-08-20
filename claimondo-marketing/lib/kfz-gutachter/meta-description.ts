import type { Stadt } from './staedte'

// Meta-Description je Stadtseite.
//
// DER BEFUND (18.08.2026): Die Beschreibung war fuer JEDE Stadt derselbe Satz
// mit ausgetauschtem Ortsnamen —
//   "Unabhaengiger Kfz-Sachverstaendiger in <Ort> nach Unfall. Zertifizierte
//    Partner, Termin unter 48 h, 0 € bei unverschuldetem Unfall (§249 BGB)."
// Bei 173 Seiten ist das 173x dieselbe Beschreibung. Fuer Suchmaschinen ist das
// ein Duplicate-Signal und genau das Muster, das seit dem Maerz-2024-Update als
// "Scaled Content" abgewertet wird; fuer Modelle ist daran nichts zitierfaehig.
// Ausserdem las die Beschreibung die freigegebene Ortstiefe nicht — die Seite
// zeigte Stadtbezirke und Verkehrsachsen, die Suchergebnis-Vorschau nicht.
//
// WAS HIER NICHT PASSIERT: nichts wird formuliert, das nicht in den Daten
// steht. Amtsgericht, PLZ-Bereich und Bundesland sind gepflegte Fakten;
// Stadtbezirke und Achsen stammen aus einem Eintrag, der das Substanz-Gate
// bestanden hat. Eine erfundene Ortsangabe waere hier besonders teuer, weil
// die Beschreibung im Suchergebnis steht, bevor jemand die Seite sieht.

/** Googles Anzeige bricht darueber ab; laengere Texte werden abgeschnitten. */
export const MAX_META_LAENGE = 160

type Ortstiefe = {
  stadtbezirke?: Array<{ name: string }>
  hauptachsen?: { autobahnen?: string[]; bundesstrassen?: string[]; knoten?: string[] }
}

/**
 * Setzt Kopf, Mittelteil und Schluss zusammen — der Schluss hat VORRANG.
 *
 * Die erste Fassung haengte den Schluss nur an, wenn er noch passte. Bei langen
 * Ortsnamen (Ludwigshafen am Rhein, Mülheim an der Ruhr) fiel er damit weg, und
 * genau die Seiten verloren den Kostenhinweis. Richtig herum: Kopf und Schluss
 * sind gesetzt, der Mittelteil fuellt, was uebrig bleibt — notfalls gar nichts.
 */
function baue(kopf: string, mitte: string, schluss: string): string {
  const mitSchluss = `${kopf} ${mitte} ${schluss}`.replace(/\s+/g, ' ').trim()
  if (mitSchluss.length <= MAX_META_LAENGE) return mitSchluss
  return `${kopf} ${schluss}`.replace(/\s+/g, ' ').trim()
}

/**
 * Die Namen in Reihenfolge, die zusammen noch in die Grenze passen.
 *
 * Ein zu langer Name wird UEBERSPRUNGEN, nicht als Abbruch gewertet. Vorher
 * stand hier `break` — mit der Folge, dass ein einziger langer Name am Anfang
 * die ganze Ortsangabe kostete: real auf prod lieferte das Modell
 * "Ortsbezirk 1 – Innenstadt I (Mitte-Ost)" (38 Zeichen, Platz ~30), und die
 * Beschreibung fiel auf den Gerichts-Fallback zurueck, obwohl zwoelf weitere
 * Bezirke dahinterstanden. Der Ausfall sah aus wie "diese Stadt hat keine
 * Ortstiefe" — deshalb faellt so etwas ohne Messung nie auf.
 *
 * Die Reihenfolge bleibt erhalten; es ist eine Auswahl, keine Aufzaehlung —
 * "und Umgebung" sagt das im Satz auch.
 */
function nenneBis(namen: string[], platz: number): string[] {
  const gewaehlt: string[] = []
  let laenge = 0
  for (const n of namen) {
    const zusatz = gewaehlt.length ? n.length + 2 : n.length
    if (laenge + zusatz > platz) continue
    gewaehlt.push(n)
    laenge += zusatz
  }
  return gewaehlt
}

/**
 * Beschreibung fuer eine Stadtseite.
 *
 * Ohne Ortstiefe traegt sie die Rechts- und Ortsanker der Stammdaten — die
 * unterscheiden sich je Stadt und sind belegt. Mit freigegebener Ortstiefe
 * treten Stadtbezirke (bevorzugt) oder Verkehrsachsen an ihre Stelle, weil das
 * die konkretere Ortsangabe ist.
 */
/**
 * Streicht amtliche Nummern-Praefixe aus Bezirksnamen — aber nur, wenn ein
 * sprechender Teil uebrig bleibt.
 *
 * "Ortsbezirk 1 - Innenstadt I"  ->  "Innenstadt I"
 * "Stadtbezirk 3 – Maxvorstadt"  ->  "Maxvorstadt"
 * "Bezirk 5"                     ->  "Bezirk 5"      (nichts dahinter — lieber
 *                                                     schwach als gar keine Ortsangabe)
 * "Hamburg-Mitte"                ->  "Hamburg-Mitte" (kein Praefix-Muster)
 *
 * Nur fuer die Beschreibung. Auf der Seite bleibt der amtliche Name stehen,
 * dort ist er richtig — hier steht er im Suchergebnis, und niemand sucht nach
 * "Ortsbezirk 1" (real so auf prod, Frankfurt, 19.08.2026).
 */
function ohneNummernPraefix(name: string): string {
  const gekuerzt = name.replace(/^(?:orts|stadt)?bezirk\s+\d+\s*[-–—:]\s*/i, '').trim()
  return gekuerzt || name
}

/**
 * Ist der Bezirksname im Suchergebnis ueberhaupt eine Aussage?
 *
 * "Bezirk 2" ist keine: niemand sucht danach, und drei davon hintereinander
 * lesen sich wie ein Automat. Real auf prod (Duesseldorf, 20.08.2026) — dort
 * tragen BEIDE Quellen reine Nummern, der Hub-Snapshot ("Bezirk 1" … "Bezirk
 * 10") wie der generierte DB-Inhalt ("Stadtbezirk 1" …). Die Beschreibung
 * lautete: "… unabhaengige Sachverstaendige fuer Bezirk 1, Bezirk 2, Bezirk 3
 * und Umgebung."
 *
 * Faellt so ein Name weg und bleibt keiner uebrig, greift automatisch der
 * Achsen-Zweig weiter unten — "Unfallaufnahme an A46, A52 und im Stadtgebiet"
 * sagt ueber den Ort mehr aus als jede Bezirksnummer.
 *
 * Roemische Ziffern zaehlen mit: Essen nummeriert seine Stadtbezirke I–IX.
 */
function istSprechenderBezirk(name: string): boolean {
  return !/^(?:orts|stadt)?bezirk\s*(?:\d+|[IVXLC]+)$/i.test(name.trim())
}

export function stadtMetaDescription(stadt: Stadt, tiefe?: Ortstiefe | null): string {
  const kopf = `Kfz-Gutachter ${stadt.h1Anker} nach Unfall:`
  // Bewusst knapp: die erste Fassung war 61 Zeichen lang und fiel damit bei
  // kurzen Ortsnamen aus der Laengengrenze — Bocholt kam auf 100 Zeichen ohne
  // jeden Hinweis auf die Kostenfreiheit, also ohne das staerkste Argument.
  // Lieber ein kuerzerer Schlusssatz, der ueberall passt, als ein vollstaendiger,
  // der auf der Haelfte der Seiten fehlt.
  const schluss = 'Termin unter 48 h, 0 € nach §249 BGB.'

  const bezirke = (tiefe?.stadtbezirke ?? [])
    .map((b) => ohneNummernPraefix(b.name))
    .filter((n) => Boolean(n) && istSprechenderBezirk(n))
  const achsen = [
    ...(tiefe?.hauptachsen?.autobahnen ?? []),
    ...(tiefe?.hauptachsen?.bundesstrassen ?? []),
  ].filter(Boolean)

  /** Was Kopf und Schluss dem Mittelteil uebrig lassen. */
  const platzFuerMitte = MAX_META_LAENGE - kopf.length - schluss.length - 2

  // Reihenfolge nach Konkretheit: ein Stadtbezirk sagt mehr ueber den Ort als
  // eine Autobahn, und die mehr als ein Gerichtsbezirk.
  if (bezirke.length) {
    const rahmen = 'unabhängige Sachverständige für  und Umgebung.'.length
    const genannt = nenneBis(bezirke, Math.max(platzFuerMitte - rahmen, 0))
    if (genannt.length) {
      return baue(kopf, `unabhängige Sachverständige für ${genannt.join(', ')} und Umgebung.`, schluss)
    }
  }

  if (achsen.length) {
    const rahmen = 'Unfallaufnahme an  und im Stadtgebiet.'.length
    // Hoechstens vier: Duesseldorf haette sonst "A46, A52, A57, A59, A524, A44,
    // A3, B1, B7" ausgespielt — passt zwar in die Laenge, liest sich aber als
    // Aufzaehlung und damit wie Keyword-Stuffing. Vier Achsen sind eine Aussage,
    // neun sind ein Datenbank-Dump.
    const genannt = nenneBis(achsen.slice(0, 4), Math.max(platzFuerMitte - rahmen, 0))
    if (genannt.length) {
      return baue(kopf, `Unfallaufnahme an ${genannt.join(', ')} und im Stadtgebiet.`, schluss)
    }
  }

  // Rueckfall ohne Ortstiefe: die gepflegten Anker. `plzPrefix` und das
  // Amtsgericht variieren je Stadt und machen die Beschreibung unterscheidbar.
  const mitGericht = `unabhängige Sachverständige im Raum ${stadt.plzPrefix} (${stadt.lokal.amtsgericht}).`
  if (mitGericht.length <= platzFuerMitte) return baue(kopf, mitGericht, schluss)

  // Bei sehr langen Orts- UND Gerichtsnamen (Ludwigshafen am Rhein, Mülheim an
  // der Ruhr) sprengt die volle Fassung die Grenze. Vorher fiel der Mittelteil
  // dann komplett weg und die Beschreibung schrumpfte auf ~88 Zeichen — die
  // kurze Fassung ohne Gerichtsnamen traegt immer noch den PLZ-Raum.
  return baue(kopf, `unabhängige Sachverständige im Raum ${stadt.plzPrefix}.`, schluss)
}
