// Geografisch naechste Stadt-Pages zu einer gegebenen Stadt.
//
// Ersetzt die vorherige Auswahl auf der Stadt-Seite, die "Nachbarstaedte" als
// `STAEDTE.filter(bundesland === s.bundesland).slice(0, 6)` bestimmte — also die
// ersten sechs Eintraege des ARRAYS im selben Bundesland, mit Auffuellern aus
// beliebigen anderen Bundeslaendern. Ergebnis war geografisch grob falsch:
// im Schnitt 132 km statt der moeglichen 54 km, und weil die Liste mit NRW
// beginnt, verlinkte Berlin Staedte in ~475 km Entfernung (Koeln, Duesseldorf,
// Aachen ...). Fuer Leser sichtbar unsinnig und ein Auto-Generated-Signal.
//
// Die Koordinaten liegen fuer jede Stadt gepflegt vor (`lat`/`lng`), die echte
// Naehe ist also reine Rechnung — keine zusaetzlichen Daten noetig.

import { STAEDTE, type Stadt } from './staedte'

/** Mittlerer Erdradius in km (IUGG). */
const ERDRADIUS_KM = 6371

type Punkt = { lat: number; lng: number }

const imBogenmass = (grad: number) => (grad * Math.PI) / 180

/**
 * Grosskreis-Entfernung (Haversine) zwischen zwei Koordinaten, in ganzen km.
 *
 * Haversine reicht hier deutlich: Wir sortieren Staedte nach Naehe, brauchen
 * also keine Ellipsoid-Genauigkeit (Vincenty). Der Fehler gegenueber WGS84
 * liegt bei diesen Distanzen im Promillebereich und aendert keine Rangfolge.
 */
export function distanzKm(a: Punkt, b: Punkt): number {
  const dLat = imBogenmass(b.lat - a.lat)
  const dLng = imBogenmass(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(imBogenmass(a.lat)) * Math.cos(imBogenmass(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * ERDRADIUS_KM * Math.asin(Math.sqrt(h)))
}

export type NachbarStadt = Stadt & { entfernungKm: number }

/**
 * Die `limit` geografisch naechsten Stadt-Pages zu `slug`, aufsteigend nach
 * Entfernung. Die Stadt selbst ist nie enthalten.
 *
 * Bewusst OHNE Entfernungs-Obergrenze: eine Kappung wuerde abgelegene Staedte
 * (Rostock, Flensburg) mit einer leeren Nachbarschaft zuruecklassen. Die sechs
 * naechsten sind immer die bestmoegliche Antwort, auch wenn sie weiter weg sind.
 *
 * Bei exakt gleicher Entfernung entscheidet der Slug — damit ist die Ausgabe
 * deterministisch und Snapshot-/Cache-stabil.
 *
 * Unbekannter Slug -> leeres Array (die Seite rendert dann keinen Block, statt
 * eine willkuerliche Liste zu zeigen).
 */
export function naechsteStaedte(slug: string, limit = 6): NachbarStadt[] {
  const start = STAEDTE.find((s) => s.slug === slug)
  if (!start) return []

  return STAEDTE.filter((s) => s.slug !== slug)
    .map((s) => ({ ...s, entfernungKm: distanzKm(start, s) }))
    .sort((a, b) => a.entfernungKm - b.entfernungKm || a.slug.localeCompare(b.slug))
    .slice(0, Math.max(0, limit))
}
