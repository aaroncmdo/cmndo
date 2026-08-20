import { describe, expect, it } from 'vitest'
import {
  DEUTSCHLAND,
  MAX_RADIUS_KM,
  mittelpunkt,
  radiusKm,
  startKacheln,
  vierteile,
  type Kachel,
} from '../kacheln'

const QUADRAT: Kachel = { sued: 51, west: 7, nord: 52, ost: 8, tiefe: 0 }

describe('mittelpunkt', () => {
  it('liegt in der Mitte', () => {
    expect(mittelpunkt(QUADRAT)).toEqual({ lat: 51.5, lng: 7.5 })
  })
})

describe('radiusKm', () => {
  it('deckt die Ecken ab, nicht nur die Kantenmitte', () => {
    // ⚠ Die halbe KANTE liesse die Ecken frei — dort saessen Bueros, die
    // niemand findet. Der Kreis muss bis in die Ecke reichen, also die halbe
    // DIAGONALE messen.
    const r = radiusKm(QUADRAT)
    const halbeKanteNS = 111 / 2               // 1 Grad Breite ≈ 111 km
    expect(r).toBeGreaterThan(halbeKanteNS)
  })

  it('rechnet Laengengrade breitenabhaengig', () => {
    // ⚠ Ein Laengengrad ist in Flensburg deutlich kuerzer als in Konstanz.
    // Ohne `cos(lat)` waeren die noerdlichen Kacheln zu breit gerechnet und
    // ihr Radius zu klein — es entstuenden Luecken.
    const sued: Kachel = { sued: 47, west: 7, nord: 48, ost: 8, tiefe: 0 }
    const nord: Kachel = { sued: 54, west: 7, nord: 55, ost: 8, tiefe: 0 }
    expect(radiusKm(sued)).toBeGreaterThan(radiusKm(nord))
  })
})

describe('vierteile', () => {
  it('teilt in vier gleiche Teile', () => {
    const teile = vierteile(QUADRAT)
    expect(teile).toHaveLength(4)
    // Zusammen ergeben sie wieder das Ganze.
    expect(Math.min(...teile.map((t) => t.sued))).toBe(51)
    expect(Math.max(...teile.map((t) => t.nord))).toBe(52)
    expect(Math.min(...teile.map((t) => t.west))).toBe(7)
    expect(Math.max(...teile.map((t) => t.ost))).toBe(8)
  })

  it('erhoeht die Tiefe', () => {
    // Ohne mitwachsende Tiefe gaebe es keine Grenze fuer die Verfeinerung,
    // und ein dichtes Stadtgebiet teilte sich unbegrenzt weiter.
    expect(vierteile(QUADRAT).every((t) => t.tiefe === 1)).toBe(true)
    expect(vierteile(vierteile(QUADRAT)[0]).every((t) => t.tiefe === 2)).toBe(true)
  })

  it('ueberlappt nicht', () => {
    const [a, b, c, d] = vierteile(QUADRAT)
    const flaeche = (k: Kachel) => (k.nord - k.sued) * (k.ost - k.west)
    const summe = flaeche(a) + flaeche(b) + flaeche(c) + flaeche(d)
    expect(summe).toBeCloseTo(flaeche(QUADRAT), 10)
  })
})

describe('startKacheln', () => {
  it('haelt jede Kachel unter der Radiusgrenze', () => {
    // ⚠ Google deckelt `radius` bei 50.000 m. Eine groessere Kachel wuerde
    // stillschweigend beschnitten — und die Luecke fiele niemandem auf.
    const kacheln = startKacheln(DEUTSCHLAND, MAX_RADIUS_KM)
    expect(kacheln.length).toBeGreaterThan(1)
    for (const k of kacheln) {
      expect(radiusKm(k), `Kachel ${JSON.stringify(k)}`).toBeLessThanOrEqual(MAX_RADIUS_KM)
    }
  })

  it('deckt das ganze Gebiet ab', () => {
    const kacheln = startKacheln(DEUTSCHLAND, MAX_RADIUS_KM)
    expect(Math.min(...kacheln.map((k) => k.sued))).toBeCloseTo(DEUTSCHLAND.sued, 6)
    expect(Math.max(...kacheln.map((k) => k.nord))).toBeCloseTo(DEUTSCHLAND.nord, 6)
    expect(Math.min(...kacheln.map((k) => k.west))).toBeCloseTo(DEUTSCHLAND.west, 6)
    expect(Math.max(...kacheln.map((k) => k.ost))).toBeCloseTo(DEUTSCHLAND.ost, 6)
  })

  it('bleibt bei einer schon kleinen Kachel bei einer', () => {
    const klein: Kachel = { sued: 51.9, west: 7.5, nord: 52.0, ost: 7.7, tiefe: 0 }
    expect(startKacheln(klein, MAX_RADIUS_KM)).toHaveLength(1)
  })

  it('liefert eine handhabbare Zahl fuer Deutschland', () => {
    // Zum Einordnen der Kosten: je Kachel und Begriff bis zu drei Abrufe.
    const n = startKacheln(DEUTSCHLAND, MAX_RADIUS_KM).length
    expect(n).toBeGreaterThan(20)
    expect(n).toBeLessThan(400)
  })
})
