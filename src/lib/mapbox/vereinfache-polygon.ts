// Polygon-Vereinfachung (Ramer-Douglas-Peucker) fuer Isochronen.
//
// WARUM: Die Isochronen der Sachverstaendigen tragen bis zu 29.093 Stuetzpunkte
// (gemessen 04.09.2026, groesstes Polygon 1,06 MB roh; 21 SVs zusammen 11 MB).
// Ihre Vereinigung landet als JSON im HTML des Embed-Finders — dort waren es
// 4,09 MB, und das erste bedienbare Element erschien erst nach 11,3 Sekunden.
// Die Anzeigen-Besucher blieben im Median 7 Sekunden; sechs von acht sahen den
// Finder nie.
//
// Fuer eine Uebersichtskarte ist diese Genauigkeit sinnlos: Bei Zoom-Stufe 9
// deckt EIN Bildschirmpixel rund 300 m ab. Punkte, die enger beieinander liegen,
// koennen per Definition nicht dargestellt werden.
//
// Kein neues Paket: @turf/simplify ist nicht installiert, und der Algorithmus
// ist kurz genug, um ihn mit einem Test abzusichern, statt eine Abhaengigkeit
// fuer 30 Zeilen aufzunehmen.

export type LngLat = [number, number]

/**
 * Standard-Toleranz in Grad. 0,0005° entspricht am Aequator rund 55 m und in
 * Deutschland (Breite ~51°) rund 35 m in Ost-West-Richtung — deutlich unter
 * einem Bildschirmpixel bei jeder Zoom-Stufe, auf der eine Abdeckungsflaeche
 * sinnvoll betrachtet wird. Die Flaeche behaelt damit sichtbar ihre Form.
 */
export const ISOCHRONE_TOLERANZ = 0.0005

/** Senkrechter Abstand von `p` zur Geraden durch `a` und `b`. */
function abstandZurGeraden(p: LngLat, a: LngLat, b: LngLat): number {
  const [px, py] = p
  const [ax, ay] = a
  const [bx, by] = b
  const dx = bx - ax
  const dy = by - ay
  // Entartete Strecke (a == b): Abstand ist schlicht die Distanz zu a.
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const laenge = Math.hypot(dx, dy)
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / laenge
}

/**
 * Ramer-Douglas-Peucker. Behaelt Anfangs- und Endpunkt sowie jeden Punkt, der
 * weiter als `toleranz` von der vereinfachten Linie abweicht.
 *
 * ⚠ ITERATIV mit eigenem Stapel, nicht rekursiv: bei bis zu 29.000 Punkten
 * kann die Rekursionstiefe im unguenstigen Fall (fast kollineare Kette) linear
 * wachsen und den Aufrufstapel sprengen. Ein Absturz beim Seitenaufbau waere
 * schlimmer als ein zu grosses Polygon.
 */
export function vereinfacheLinie(punkte: LngLat[], toleranz: number): LngLat[] {
  if (punkte.length <= 2 || toleranz <= 0) return punkte

  const behalten = new Uint8Array(punkte.length)
  behalten[0] = 1
  behalten[punkte.length - 1] = 1

  const stapel: Array<[number, number]> = [[0, punkte.length - 1]]
  while (stapel.length > 0) {
    const [von, bis] = stapel.pop()!
    if (bis - von < 2) continue

    let maxAbstand = -1
    let maxIndex = -1
    for (let i = von + 1; i < bis; i++) {
      const d = abstandZurGeraden(punkte[i], punkte[von], punkte[bis])
      if (d > maxAbstand) {
        maxAbstand = d
        maxIndex = i
      }
    }
    if (maxAbstand > toleranz && maxIndex > 0) {
      behalten[maxIndex] = 1
      stapel.push([von, maxIndex], [maxIndex, bis])
    }
  }

  const raus: LngLat[] = []
  for (let i = 0; i < punkte.length; i++) if (behalten[i]) raus.push(punkte[i])
  return raus
}

/**
 * Vereinfacht einen Polygon-Ring und haelt ihn dabei gueltig.
 *
 * Zwei Eigenschaften, die ein blosses `vereinfacheLinie` nicht garantiert:
 *  - Ein Ring braucht mindestens 3 verschiedene Punkte. Faellt die Vereinfachung
 *    darunter (sehr kleine Flaeche, grobe Toleranz), wird der Ring UNVERAENDERT
 *    zurueckgegeben — lieber gross als kaputt: ein entarteter Ring laesst
 *    `@turf/union` werfen und riss im Zweifel die ganze Coverage-Flaeche mit.
 *  - Ist der Ring geschlossen (erster Punkt == letzter), bleibt er es auch.
 */
export function vereinfacheRing(ring: LngLat[], toleranz = ISOCHRONE_TOLERANZ): LngLat[] {
  if (ring.length < 4) return ring

  const geschlossen =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  // Beim geschlossenen Ring den Doppelpunkt vor der Vereinfachung entfernen:
  // Anfang und Ende waeren sonst identisch, die Gerade dazwischen entartet.
  const offen = geschlossen ? ring.slice(0, -1) : ring

  const vereinfacht = vereinfacheLinie(offen, toleranz)
  if (vereinfacht.length < 3) return ring

  return geschlossen ? [...vereinfacht, vereinfacht[0]] : vereinfacht
}
