import ROH from './stadt-unfallhotspots.json'

// Unfallhäufungen je Stadt — amtlicher Unfallatlas der Statistischen Ämter des
// Bundes und der Länder, Jahrgänge 2021–2025, Datenlizenz Deutschland 2.0.
//
// WARUM DAS HIER STEHT: Von allen Substanz-Kategorien der Ortsinhalte blieb
// genau eine systematisch leer — Unfallschwerpunkte (4 von 5 Städten null).
// Das ist kein Prompt-Problem: der Quellenzwang verlangt eine belegbare URL,
// das Modell kennt für einen konkreten Ort keine und lässt korrekt weg.
// Nur eine Datenquelle schließt diese Lücke.
//
// WARUM NICHT IN stadt_lokalinhalte: Die Pipeline überspringt jede Stadt, die
// dort schon eine Zeile hat (pipeline.ts). Ein Import dieser Daten in die
// Tabelle hätte für 160 Städte den kompletten KI-Lokalinhalt blockiert.
// Amtliche Daten brauchen ohnehin keinen Review-Workflow und kein
// `ai_generated` — sie sind statisch und gelten für ALLE Städte sofort,
// nicht mit ~2 pro Nacht.
//
// Erzeugt von scripts/generate-stadt-unfallhotspots.mjs (jährlich, sobald ein
// neuer Jahrgang erscheint — zuletzt 2025, Stand 07.07.2026).

export type Unfallhotspot = {
  /** Nur der Straßenname, bewusst ohne Hausnummer: die Häufung ist ein
   *  ~100-m-Bereich, keine Adresse. */
  strasse: string
  stadtteil: string | null
  /** Unfälle MIT PERSONENSCHADEN im Zeitraum — der Unfallatlas erfasst
   *  ausschließlich solche, reine Blechschäden stehen nicht darin. */
  unfaelle: number
  schwerverletzte: number
  getoetete: number
  lat: number
  lng: number
}

export type StadtUnfalldaten = {
  zeitraum: string
  quelle: string
  lizenz: string
  hotspots: Unfallhotspot[]
}

const DATEN = ROH as Record<string, StadtUnfalldaten>

export function getUnfallhotspots(slug: string): StadtUnfalldaten | null {
  return DATEN[slug] ?? null
}

/**
 * Straßenklasse ausschreiben: aus „A 30" wird „Autobahn A 30".
 *
 * 28 der 450 Häufungen liegen nicht an einer benannten Straße, sondern an
 * einer nummerierten — dort liefert das Geocoding nur das Kürzel. „A 30
 * (Bünde)" als Überschrift liest sich wie ein Tippfehler; ausgeschrieben ist
 * sofort klar, wovon die Rede ist.
 */
function strasseLesbar(s: string): string {
  const m = s.trim().match(/^([ABKL])\s*(\d+[a-z]?)$/i)
  if (!m) return s
  const klasse = { a: 'Autobahn', b: 'Bundesstraße', k: 'Kreisstraße', l: 'Landesstraße' }[m[1].toLowerCase()]
  return `${klasse} ${m[1].toUpperCase()} ${m[2]}`
}

/** „Hohenstaufenring (Neustadt)" — der Stadtteil nur, wenn er bekannt ist. */
export function hotspotOrt(h: Unfallhotspot): string {
  const strasse = strasseLesbar(h.strasse)
  return h.stadtteil ? `${strasse} (${h.stadtteil})` : strasse
}

/**
 * Der Faktensatz zu einer Häufung.
 *
 * ⚠ BEWUSST OHNE WERTUNG. „Dort wurden 64 Unfälle mit Personenschaden erfasst"
 * ist belegbar; „dort ist es gefährlich" wäre eine Tatsachenbehauptung über
 * einen realen Ort, für die die Daten nicht reichen — sie enthalten keine
 * Ursachen und keine Verkehrsmenge. Genau deshalb gibt es den Quellenzwang.
 *
 * Ebenso wenig eine Kausalaussage: eine viel befahrene Hauptachse hat mehr
 * Unfälle als eine Nebenstraße, ohne deshalb schlechter gebaut zu sein.
 */
export function hotspotSatz(h: Unfallhotspot, zeitraum: string): string {
  const teile = [`${zeitraum} wurden hier ${h.unfaelle} Unfälle mit Personenschaden erfasst`]
  if (h.getoetete > 0) {
    teile.push(
      h.getoetete === 1 ? 'darunter einer mit tödlichem Ausgang' : `darunter ${h.getoetete} mit tödlichem Ausgang`,
    )
  }
  if (h.schwerverletzte > 0) {
    teile.push(
      h.schwerverletzte === 1 ? 'einer davon mit Schwerverletzten' : `${h.schwerverletzte} davon mit Schwerverletzten`,
    )
  }
  return `${teile.join(', ')}.`
}
