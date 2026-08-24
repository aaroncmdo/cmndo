import type { Holer } from '../anreicherung/lauf'
import type { PlacesAdapter } from '../places'
import type { ModulId, Modus } from './registry'

/**
 * Ampelschwellen aus GESAMTSPEC §6: <40 % rot, 40–70 % gelb, >70 % gruen.
 *
 * ⚠ `offen` ist eine ERGAENZUNG zum Mockup-Vertrag (der nur drei Farben kennt)
 * und inhaltlich notwendig: Ein nicht erhobener Wert darf nicht rot sein. Rot
 * heisst „schlecht" — bei einer Fehlstelle wuerde die Ampel genau die
 * Unterscheidung wieder einebnen, die R-B verlangt („nicht erhoben" ist kein
 * Mangel des Betriebs, sondern eine Grenze der Messung). Am echten Lauf
 * aufgefallen (19.08.): „Impressum nicht erhoben" stand rot neben einem echten
 * „Impressum fehlt" — optisch nicht unterscheidbar.
 */
export type Ampel = 'rot' | 'gelb' | 'gruen' | 'offen'

export function ampelFuer(ist: number, maximum: number): Ampel {
  if (maximum <= 0) return 'gruen'
  const anteil = ist / maximum
  if (anteil < 0.4) return 'rot'
  if (anteil <= 0.7) return 'gelb'
  return 'gruen'
}

/**
 * Ein einzelner Messwert.
 *
 * Die Form folgt `mockup-levelup-auswertung.html` (`befunde:[{w,l,a,i}]`) —
 * die Auswertung erwartet Wert, Label, Ampel und Einordnung. `quelle` und
 * `erhoben` kommen aus R-A hinzu: ohne beides wird der Befund verworfen.
 */
export type Befund = {
  schluessel: string
  label: string
  /** `null` heisst „nicht erhoben" und verlangt ein `grund` (R-B). Nie 0 als Ersatz. */
  wert: string | number | boolean | null
  punkte: number
  maximum: number
  ampel: Ampel
  /** Einordnung fuer den Leser („Median im Gebiet 11") — optional, aber erwuenscht. */
  einordnung?: string
  /** R-A: woher der Wert stammt. Pflicht. */
  quelle: string
  /** R-A: wann er erhoben wurde, ISO. Pflicht. */
  erhoben: string
  /** R-B: warum nichts erhoben wurde. Pflicht, wenn `wert === null`. */
  grund?: string
}

/** Was nicht gemessen werden konnte — ein Ergebnis, keine Luecke (R-B). */
export type Fehlstelle = { schluessel: string; grund: string }

export type Messergebnis = { befunde: Befund[]; fehlstellen: Fehlstelle[] }

export type Messkontext = {
  modus: Modus
  websiteUrl: string | null
  standort: { lat: number; lng: number; ort: string | null; plz: string | null } | null
  /** robots.txt-konform, gedrosselt, gecacht — aus lib/anreicherung/netz. */
  hole: Holer
  places: PlacesAdapter
  /** Fuer `erhoben`. Injiziert, damit Tests einen festen Zeitpunkt setzen koennen. */
  jetzt: () => string
}

export type Messfunktion = (k: Messkontext) => Promise<Messergebnis>

/** Kurzform fuer einen erhobenen Wert. */
export function befund(
  schluessel: string,
  label: string,
  wert: string | number | boolean,
  punkte: number,
  maximum: number,
  quelle: string,
  erhoben: string,
  einordnung?: string,
): Befund {
  return {
    schluessel, label, wert, punkte, maximum,
    ampel: ampelFuer(punkte, maximum),
    einordnung, quelle, erhoben,
  }
}

/**
 * Kurzform fuer „nicht erhoben".
 *
 * ⚠ Punkte sind 0, aber `wert` ist `null` und `ampel` ist `rot` — die ANZEIGE
 * muss beides unterscheiden koennen: „0 von 4 Fotos" ist ein Messwert,
 * „nicht erhoben" ist keiner. Ein Balken auf 0 fuer etwas Ungemessenes waere
 * eine Behauptung (R-B).
 */
export function nichtErhoben(
  schluessel: string,
  label: string,
  maximum: number,
  grund: string,
  quelle: string,
  erhoben: string,
): Befund {
  return {
    schluessel, label, wert: null, punkte: 0, maximum,
    ampel: 'offen', grund, quelle, erhoben,
  }
}

/** Registry der Messfunktionen. Wird in `module/index.ts` gefuellt. */
export type MessRegistry = Partial<Record<ModulId, Messfunktion>>
