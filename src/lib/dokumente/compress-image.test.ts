import { describe, it, expect } from 'vitest'
import { zielMasse } from './compress-image'

// Nur die pure Resize-Mathematik ist unit-testbar; createImageBitmap/Canvas/FileReader
// sind Browser-APIs (jsdom-frei) -> deren Verhalten deckt der Regel-4-Prod-Smoke ab.
describe('zielMasse', () => {
  it('laesst Bilder <= 2400 unveraendert', () => {
    expect(zielMasse(800, 600)).toEqual({ width: 800, height: 600 })
    expect(zielMasse(2400, 2400)).toEqual({ width: 2400, height: 2400 })
    expect(zielMasse(2400, 1000)).toEqual({ width: 2400, height: 1000 })
  })

  it('skaliert Querformat auf 2400 laengste Seite', () => {
    expect(zielMasse(4800, 2400)).toEqual({ width: 2400, height: 1200 })
    expect(zielMasse(3000, 2000)).toEqual({ width: 2400, height: 1600 })
  })

  it('skaliert Hochformat auf 2400 laengste Seite', () => {
    expect(zielMasse(2400, 4800)).toEqual({ width: 1200, height: 2400 })
    expect(zielMasse(2000, 3000)).toEqual({ width: 1600, height: 2400 })
  })

  it('grosses Quadrat -> 2400x2400', () => {
    expect(zielMasse(4800, 4800)).toEqual({ width: 2400, height: 2400 })
  })

  it('erhaelt das Seitenverhaeltnis bei 48MP iPhone-Foto (8064x6048)', () => {
    const r = zielMasse(8064, 6048)
    expect(r).toEqual({ width: 2400, height: 1800 })
    expect(Math.abs(r.width / r.height - 8064 / 6048)).toBeLessThan(0.01)
  })
})
