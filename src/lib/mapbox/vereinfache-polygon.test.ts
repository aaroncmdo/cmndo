// Eine Vereinfachung, die Punkte entfernt, ist trivial. Eine, die dabei die
// FORM behaelt, ist der eigentliche Anspruch: Die Coverage-Flaeche sagt dem
// Kunden, wo ein Gutachter zu ihm kommt. Verzieht sie sich, zeigen wir ein
// falsches Versprechen — leiser Schaden, den keine Ladezeit-Messung faengt.

import { describe, it, expect } from 'vitest'
import { vereinfacheLinie, vereinfacheRing, ISOCHRONE_TOLERANZ, type LngLat } from './vereinfache-polygon'

/** Groesster Abstand eines Originalpunkts zur vereinfachten Linie. */
function maxAbweichung(original: LngLat[], vereinfacht: LngLat[]): number {
  let max = 0
  for (const p of original) {
    let naechster = Infinity
    for (let i = 0; i < vereinfacht.length - 1; i++) {
      const [ax, ay] = vereinfacht[i]
      const [bx, by] = vereinfacht[i + 1]
      const dx = bx - ax, dy = by - ay
      const l2 = dx * dx + dy * dy
      // Projektion auf das Segment, auf [0,1] begrenzt
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2))
      naechster = Math.min(naechster, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)))
    }
    max = Math.max(max, naechster)
  }
  return max
}

/** Kreis mit `n` Stuetzpunkten — das Modell einer Isochrone (glatt, geschlossen). */
function kreis(n: number, radius = 0.5, cx = 7, cy = 51): LngLat[] {
  const pts: LngLat[] = []
  for (let i = 0; i < n; i++) {
    const w = (i / n) * Math.PI * 2
    pts.push([cx + Math.cos(w) * radius, cy + Math.sin(w) * radius])
  }
  pts.push(pts[0]) // schliessen
  return pts
}

describe('vereinfacheLinie', () => {
  it('behaelt Anfang und Ende', () => {
    const linie: LngLat[] = [[0, 0], [1, 0.00001], [2, 0], [3, 0.00001], [4, 0]]
    const v = vereinfacheLinie(linie, 0.001)
    expect(v[0]).toEqual([0, 0])
    expect(v[v.length - 1]).toEqual([4, 0])
  })

  it('entfernt nahezu kollineare Punkte', () => {
    const linie: LngLat[] = [[0, 0], [1, 0.00001], [2, 0], [3, 0.00001], [4, 0]]
    expect(vereinfacheLinie(linie, 0.001).length).toBe(2)
  })

  it('behaelt eine echte Ecke', () => {
    // Der Knick bei [2,1] liegt weit ueber der Toleranz — er MUSS bleiben,
    // sonst wuerde aus einem Winkel eine Gerade.
    const linie: LngLat[] = [[0, 0], [1, 0.5], [2, 1], [3, 0.5], [4, 0]]
    expect(vereinfacheLinie(linie, 0.01)).toContainEqual([2, 1])
  })

  it('kommt mit sehr vielen Punkten aus, ohne den Aufrufstapel zu sprengen', () => {
    // Der reale Grund fuer die iterative Umsetzung: das groesste gemessene
    // Isochronen-Polygon traegt 29.093 Punkte.
    const viele = kreis(30000)
    expect(() => vereinfacheLinie(viele, ISOCHRONE_TOLERANZ)).not.toThrow()
  })
})

describe('vereinfacheRing', () => {
  it('reduziert eine Isochrone deutlich', () => {
    const roh = kreis(20000)
    const v = vereinfacheRing(roh)
    expect(v.length).toBeLessThan(roh.length / 10)
  })

  it('haelt die Form innerhalb der Toleranz', () => {
    const roh = kreis(20000)
    const v = vereinfacheRing(roh)
    // Das ist die eigentliche Zusicherung: Kein Originalpunkt weicht weiter ab
    // als erlaubt — die angezeigte Flaeche bleibt die zugesagte Flaeche.
    expect(maxAbweichung(roh, v)).toBeLessThanOrEqual(ISOCHRONE_TOLERANZ * 1.01)
  })

  it('haelt den Ring geschlossen', () => {
    const v = vereinfacheRing(kreis(5000))
    expect(v[0]).toEqual(v[v.length - 1])
  })

  it('laesst zu kleine Ringe unveraendert, statt sie zu entarten', () => {
    // Lieber ein grosses Polygon als ein kaputtes: ein entarteter Ring laesst
    // @turf/union werfen und riss im Zweifel die ganze Coverage-Flaeche mit.
    const winzig: LngLat[] = [[7, 51], [7.00001, 51], [7.00001, 51.00001], [7, 51]]
    expect(vereinfacheRing(winzig, 1)).toEqual(winzig)
  })

  it('laesst ein Quadrat als Quadrat stehen', () => {
    const quadrat: LngLat[] = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]
    const v = vereinfacheRing(quadrat, 0.0001)
    expect(v.length).toBe(5)
  })
})
