// Pure Scan-Logik fuer check:client-timezone — Zeitformatierung ohne feste Zone in
// Client-Components. Keine I/O -> unit-testbar (vitest). CLI-Wrapper: ../check-client-timezone.mjs
//
// DIE FEHLERKLASSE: Eine `'use client'`-Component wird server-seitig vorgerendert UND im
// Browser hydriert. `toLocaleString()` ohne `timeZone` nimmt auf jeder Seite die dort
// geltende Zone — und die ist verschieden:
//
//   prod-Node (pm2 id 862):  TZ=Europe/Berlin  ->  "Mi., 05.08., 10:00"
//   CI-Browser (GH-Runner):  UTC               ->  "Mi., 05.08., 08:00"
//
// Zwei verschiedene Texte an derselben Stelle = React-Hydration-Fehler #418. Genau das
// faerbte den nightly vom 06.08. bis 27.08. rot (EmbedBKlaerungCard.tsx:70, PR #5670).
//
// ⭐⭐ Der Grund, warum es 20 Tage dauerte: Ein Entwickler-Browser steht in Europe/Berlin
// und rendert damit DASSELBE wie der Server. Lokal ist der Fehler unsichtbar — vier gruene
// prod-Laeufe galten als Gegenbeweis und waren in Wahrheit blind. Deshalb dieser Ratchet:
// die Klasse ist per Code-Lesen sicher zu finden, per lokalem Testlauf aber nicht.
//
// ⚠ Es ist NICHT nur ein Hydration-Thema. Ohne feste Zone sieht ein SV im Ausland schlicht
// falsche Termine — die Anzeige haengt dann an der Browser-Zeitzone statt am Geschaeft.
//
// ZWEI SCHWEREGRADE:
//   * MIT-UHRZEIT (`hour`/`minute`)  -> weicht IMMER ab, sobald die Zonen differieren. Hard-0.
//   * NUR-DATUM  (`day`/`month`/…)   -> kippt nur an Tagesgrenzen. Grandfathered.

/** Formatierungs-Methoden, die eine Zone brauchen. */
const METHODEN = /toLocale(?:Date|Time)?String\s*\(/

export const SKIP_MARKER = 'client-timezone-skip:'

function stripComments(src) {
  // Kommentar-Zeichen durch Spaces GLEICHER Laenge ersetzen (Newlines bleiben) —
  // so bleiben Zeilennummern identisch zum Original.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

/**
 * Findet `toLocale*String(...)`-Aufrufe MIT Options-Objekt, denen `timeZone` fehlt.
 *
 * Bewusst NUR Aufrufe mit Options-Objekt: `toLocaleDateString('de-DE')` ohne Optionen
 * ist die kurze Datumsform und in der Praxis kein Hydration-Traeger — und ein Ratchet
 * mit Fehlalarmen blockiert die Fleet und wird abgeschaltet.
 *
 * @param {string} quelltext Datei-Inhalt
 * @param {string} pfad Repo-relativer Pfad (nur fuer die Ausgabe)
 * @returns {{pfad:string, zeile:number, schwere:'uhrzeit'|'datum'}[]}
 */
export function scanneDatei(quelltext, pfad) {
  if (!quelltext.includes("'use client'") && !quelltext.includes('"use client"')) return []
  if (quelltext.includes(SKIP_MARKER)) return []

  const src = stripComments(quelltext)
  if (!METHODEN.test(src)) return []

  const treffer = []
  // Aufruf + erstes Options-Objekt einsammeln. `[^{}]*` haelt es auf EINE Objektebene
  // begrenzt — verschachtelte Optionen gibt es bei Intl nicht, und so kann der Ausdruck
  // nicht ueber das Ende des Aufrufs hinauslaufen.
  const re = /toLocale(?:Date|Time)?String\s*\(\s*[^)]*?\{([^{}]*)\}/g
  let m
  while ((m = re.exec(src)) !== null) {
    const optionen = m[1]
    if (/\btimeZone\b/.test(optionen)) continue
    const hatUhrzeit = /\b(hour|minute|second|timeStyle)\b/.test(optionen)
    const hatDatum = /\b(day|month|year|weekday|dateStyle)\b/.test(optionen)
    if (!hatUhrzeit && !hatDatum) continue
    treffer.push({
      pfad,
      zeile: src.slice(0, m.index).split('\n').length,
      schwere: hatUhrzeit ? 'uhrzeit' : 'datum',
    })
  }
  return treffer
}

/** Schluessel fuer Baseline-Vergleiche (stabil gegen Zeilenverschiebung im File). */
export function trefferKey(t) {
  return `${t.pfad}::${t.schwere}`
}
