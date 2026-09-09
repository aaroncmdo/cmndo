import { describe, it, expect } from 'vitest'

import { umkreisBox } from '../umkreis-box'

// PostgREST-1000-Deckel-Fix: die Umkreis-Box zieht den Radius-Filter in die DB.
// Die einzige Eigenschaft, die dabei zaehlt, ist SUPERSET — waere die Box
// irgendwo schmaler als der Kreis, verschwaenden Kandidaten still.
//
// ⚠ Gemessen wird gegen die "destination point"-Formel, NICHT gegen die Formel
// aus umkreis-box.ts. Ein Test, der dieselbe Rechnung noch einmal ausfuehrt,
// bestaetigt nur sich selbst.

const R_KM = 6371

/**
 * Punkt in Entfernung `d` unter Kurs `bearing` — Standard-Grosskreisformel,
 * unabhaengig von der Box-Berechnung.
 */
function zielpunkt(lat: number, lng: number, distanzKm: number, bearingGrad: number) {
  const rad = Math.PI / 180
  const delta = distanzKm / R_KM
  const theta = bearingGrad * rad
  const phi1 = lat * rad
  const lambda1 = lng * rad

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  )
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    )

  return { lat: phi2 / rad, lng: lambda2 / rad }
}

function liegtInBox(p: { lat: number; lng: number }, b: ReturnType<typeof umkreisBox>) {
  return p.lat >= b.latVon && p.lat <= b.latBis && p.lng >= b.lngVon && p.lng <= b.lngBis
}

// Der reale Bestand: sv_leads reichen von 47,49° bis 54,91° N und
// 5,94° bis 14,99° O (prod, gemessen 09.09.2026). Plus zwei Extrembreiten,
// damit die Formel nicht nur fuer Deutschland stimmt.
const ORTE: Array<[string, number, number]> = [
  ['Flensburg (Nordrand)', 54.91, 9.44],
  ['Hamburg', 53.55, 9.99],
  ['Berlin', 52.52, 13.4],
  ['Koeln', 50.94, 6.96],
  ['Muenchen', 48.14, 11.58],
  ['Oberstdorf (Suedrand)', 47.49, 10.28],
  ['Aequator', 0, 0],
  ['Tromsoe (hohe Breite)', 69.65, 18.96],
]

const RADIEN = [15, 25, 30, 50, 80]

describe('umkreisBox', () => {
  it('enthaelt den gesamten Kreisrand — jede Breite, jeder Radius, alle 360 Kurse', () => {
    for (const [name, lat, lng] of ORTE) {
      for (const radiusKm of RADIEN) {
        const box = umkreisBox(lat, lng, radiusKm)
        for (let bearing = 0; bearing < 360; bearing += 1) {
          const p = zielpunkt(lat, lng, radiusKm, bearing)
          expect(
            liegtInBox(p, box),
            `${name}, r=${radiusKm}km, Kurs ${bearing}°: (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}) faellt aus der Box`,
          ).toBe(true)
        }
      }
    }
  })

  it('enthaelt auch Punkte INNERHALB des Kreises, nicht nur den Rand', () => {
    const box = umkreisBox(50.94, 6.96, 30)
    for (const anteil of [0.1, 0.5, 0.9]) {
      for (let bearing = 0; bearing < 360; bearing += 15) {
        const p = zielpunkt(50.94, 6.96, 30 * anteil, bearing)
        expect(liegtInBox(p, box)).toBe(true)
      }
    }
  })

  it('POSITIVKONTROLLE: eine mit cos(Mittelpunkt) gerechnete Box schneidet am Nordrand — der Test wuerde es merken', () => {
    // Genau der Fehler, den umkreis-box.ts vermeidet: cos am Mittelpunkt statt
    // am polnaeheren Rand. Ohne diesen Nachweis waere unklar, ob der Test oben
    // ueberhaupt etwas messen KANN.
    const lat = 54.91
    const lng = 9.44
    const radiusKm = 80
    const dLat = radiusKm / 111.32
    const dLngNaiv = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))
    const naiveBox = {
      latVon: lat - dLat,
      latBis: lat + dLat,
      lngVon: lng - dLngNaiv,
      lngBis: lng + dLngNaiv,
    }

    const ausreisser = Array.from({ length: 360 }, (_, b) => zielpunkt(lat, lng, radiusKm, b)).filter(
      (p) => !liegtInBox(p, naiveBox),
    )
    expect(ausreisser.length).toBeGreaterThan(0)

    // Dieselben Punkte liegen in der echten Box.
    const echt = umkreisBox(lat, lng, radiusKm)
    for (const p of ausreisser) expect(liegtInBox(p, echt)).toBe(true)
  })

  it('ist nicht sinnlos gross — hoechstens 15 % breiter als der reine Kreis', () => {
    // Eine Box, die halb Europa umfasst, waere zwar "korrekt", holte aber
    // wieder zu viele Zeilen. Die Marge bleibt klein.
    const lat = 50.94
    const radiusKm = 30
    const box = umkreisBox(lat, 6.96, radiusKm)
    const breiteKm = ((box.lngBis - box.lngVon) / 2) * 111.32 * Math.cos((lat * Math.PI) / 180)
    const hoeheKm = ((box.latBis - box.latVon) / 2) * 111.32
    expect(breiteKm).toBeLessThan(radiusKm * 1.15)
    expect(hoeheKm).toBeLessThan(radiusKm * 1.15)
  })
})
