import { describe, it, expect } from 'vitest'
import { bandBrightness, bandGradient } from '../pulsing-route'

describe('bandBrightness — dreieckige Puls-Bande mit Ring-Wrap', () => {
  const HW = 0.13

  it('ist maximal (1) im Zentrum t', () => {
    expect(bandBrightness(0.5, 0.5, HW)).toBeCloseTo(1, 6)
    expect(bandBrightness(0.2, 0.2, HW)).toBeCloseTo(1, 6)
  })

  it('fällt linear auf 0 an den Rändern ±halfWidth', () => {
    expect(bandBrightness(0.5 + HW, 0.5, HW)).toBeCloseTo(0, 6)
    expect(bandBrightness(0.5 - HW, 0.5, HW)).toBeCloseTo(0, 6)
    // Halbdistanz → halbe Helligkeit
    expect(bandBrightness(0.5 + HW / 2, 0.5, HW)).toBeCloseTo(0.5, 5)
  })

  it('ist 0 ausserhalb der Bandbreite', () => {
    expect(bandBrightness(0.5, 0.9, HW)).toBe(0)
    expect(bandBrightness(0.1, 0.8, HW)).toBe(0)
  })

  it('wrappt über die 0/1-Grenze (Ring-Distanz)', () => {
    // t=0.98, pos=0.02 → lineare Distanz 0.96, Ring-Distanz 0.04 < halfWidth → sichtbar
    expect(bandBrightness(0.02, 0.98, HW)).toBeGreaterThan(0)
    expect(bandBrightness(0.02, 0.98, HW)).toBeCloseTo(1 - 0.04 / HW, 6)
    // symmetrisch andersrum
    expect(bandBrightness(0.98, 0.02, HW)).toBeGreaterThan(0)
  })

  it('halfWidth<=0 → 0 (kein Div-durch-0)', () => {
    expect(bandBrightness(0.5, 0.5, 0)).toBe(0)
    expect(bandBrightness(0.5, 0.5, -1)).toBe(0)
  })
})

describe('bandGradient — gültiger Mapbox-line-gradient-Ausdruck', () => {
  it('beginnt mit interpolate/linear/line-progress', () => {
    const g = bandGradient(0.5, 0.13, '#ffffff', 0.9)
    expect(g[0]).toBe('interpolate')
    expect(g[1]).toEqual(['linear'])
    expect(g[2]).toEqual(['line-progress'])
  })

  it('hat streng aufsteigende Stops von 0 bis 1', () => {
    const g = bandGradient(0.3, 0.13, '#ffffff', 0.9)
    const positions: number[] = []
    for (let i = 3; i < g.length; i += 2) positions.push(g[i] as number)
    expect(positions[0]).toBe(0)
    expect(positions[positions.length - 1]).toBe(1)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1])
    }
  })

  it('der hellste Stop folgt t (Bandmitte wandert mit t)', () => {
    // Alpha des Stops, dessen Position `target` am nächsten liegt.
    const alphaNearest = (g: unknown[], target: number): number => {
      let bestPos = -1
      let bestAlpha = 0
      for (let i = 3; i < g.length; i += 2) {
        const pos = g[i] as number
        const col = g[i + 1] as string
        const a = parseFloat(col.slice(col.lastIndexOf(',') + 1, col.lastIndexOf(')')))
        if (bestPos < 0 || Math.abs(pos - target) < Math.abs(bestPos - target)) {
          bestPos = pos
          bestAlpha = a
        }
      }
      return bestAlpha
    }
    const g1 = bandGradient(0.25, 0.13, '#ffffff', 0.9)
    expect(alphaNearest(g1, 0.25)).toBeGreaterThan(alphaNearest(g1, 0.75))
    const g2 = bandGradient(0.75, 0.13, '#ffffff', 0.9)
    expect(alphaNearest(g2, 0.75)).toBeGreaterThan(alphaNearest(g2, 0.25))
  })

  it('nutzt die übergebene Farbe (rgb aus hex)', () => {
    // 0x45=69, 0x73=115, 0xA2=162
    const g = bandGradient(0.5, 0.13, '#4573A2', 0.9)
    for (let i = 4; i < g.length; i += 2) {
      expect((g[i] as string).startsWith('rgba(69, 115, 162,')).toBe(true)
    }
  })
})
