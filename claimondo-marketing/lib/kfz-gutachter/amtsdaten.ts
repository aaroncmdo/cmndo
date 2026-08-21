import ROH from './staedte-amtsdaten.json'

// Amtliche Kfz-Zahlen je Stadt — Kraftfahrt-Bundesamt, FZ 3 ("Bestand nach
// Gemeinden"), Datenlizenz Deutschland 2.0.
//
// WARUM DAS HIER STEHT: Gemessen am 20.08.2026 sind 166 von 173 Stadtseiten
// untereinander ~93 % identisch — nur 3 von 135 Textbloecken sind eigenstaendig
// (Ortsname, PLZ, Gerichtsbezirk). Der generierte Lokalinhalt ist der einzige
// echte Unterscheider, aber er entsteht nur mit ~2 Staedten pro Nacht, und die
// KI kann keine belegbaren Zahlen liefern: der Quellenzwang verlangt eine echte
// Quell-URL, und die kennt sie nicht.
//
// Amtliche Daten schliessen genau diese Luecke — fuer ALLE 173 Staedte
// gleichzeitig, ohne KI-Kosten, mit nennbarer Quelle.
//
// Erzeugt von scripts/generate-stadt-amtsdaten.mjs (jaehrlich, wenn das KBA
// einen neuen Jahrgang veroeffentlicht — naechster Termin laut KBA Mai 2027).

export type StadtAmtsdaten = {
  /** Amtlicher Gemeindeschluessel, 8-stellig. Bruecke zu jeder weiteren
   *  amtlichen Quelle (Unfallatlas, Destatis) — die schluesseln alle darauf. */
  ags: string
  /** Schreibweise des KBA, nur zur Nachvollziehbarkeit des Abgleichs. */
  kbaName: string
  kfz: {
    pkw: number
    pkwGewerblich: number
    lkw: number
    kraftraeder: number
    anhaenger: number
  }
  stand: string
  quelle: string
}

const AMTSDATEN = ROH as Record<string, StadtAmtsdaten>

export function getAmtsdaten(slug: string): StadtAmtsdaten | null {
  return AMTSDATEN[slug] ?? null
}

/**
 * Pkw je 1.000 Einwohner — aus zwei gepflegten Werten abgeleitet.
 *
 * Bewusst gerundet und ohne Vergleichsaussage: „591 Pkw je 1.000 Einwohner" ist
 * belegbar, „ueberdurchschnittlich motorisiert" waere eine Wertung, fuer die
 * uns die Vergleichsbasis fehlt.
 *
 * `null` statt einer Zahl, wenn die Einwohnerangabe fehlt — eine erfundene
 * Kennzahl auf einer Seite, die ueber einen realen Ort spricht, ist teurer als
 * eine fehlende.
 */
export function pkwJeTausendEinwohner(pkw: number, bevoelkerung: string): number | null {
  const t = String(bevoelkerung ?? '')
  const n = parseFloat(t.replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  const einwohner = t.includes('Mio') ? n * 1_000_000 : t.includes('Tsd') ? n * 1000 : n
  if (einwohner < 1000) return null
  return Math.round((pkw / einwohner) * 1000)
}
