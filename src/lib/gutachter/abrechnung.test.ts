import { describe, expect, it } from 'vitest'
import { berechneSvNetto, formatEuro, tageSeit } from './abrechnung'

describe('berechneSvNetto', () => {
  it('beides da → Differenz', () => {
    expect(berechneSvNetto({ honorar: 800, leadpreis: 220 })).toBe(580)
  })
  it('nur Honorar → null', () => {
    expect(berechneSvNetto({ honorar: 800 })).toBeNull()
  })
  it('nur Leadpreis → null', () => {
    expect(berechneSvNetto({ leadpreis: 220 })).toBeNull()
  })
  it('input null → null', () => {
    expect(berechneSvNetto(null)).toBeNull()
  })
})

describe('formatEuro', () => {
  it('formatiert mit de-DE + EUR', () => {
    const r = formatEuro(580.5)
    expect(r).toContain('580')
    expect(r).toMatch(/€|EUR/)
  })
  it('null → —', () => {
    expect(formatEuro(null)).toBe('—')
  })
})

describe('tageSeit', () => {
  it('vor 2 Tagen → 2', () => {
    const vor2t = new Date(Date.now() - 2 * 86400000).toISOString()
    expect(tageSeit(vor2t)).toBe(2)
  })
  it('Zukunft → 0 (keine negativen Werte)', () => {
    const future = new Date(Date.now() + 86400000).toISOString()
    expect(tageSeit(future)).toBe(0)
  })
  it('null → null', () => {
    expect(tageSeit(null)).toBeNull()
  })
})
