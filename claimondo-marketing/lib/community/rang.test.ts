import { describe, it, expect } from 'vitest'
import { tierLabel, isTier, rangMapFromRows } from './rang'

describe('tierLabel', () => {
  it('mappt Tiers auf ehrliche Labels', () => {
    expect(tierLabel('gold')).toBe('Gold-Partner')
    expect(tierLabel('silber')).toBe('Silber-Partner')
    expect(tierLabel('bronze')).toBe('Bronze-Partner')
  })
})

describe('isTier', () => {
  it('akzeptiert nur valide Tiers', () => {
    expect(isTier('gold')).toBe(true)
    expect(isTier('silber')).toBe(true)
    expect(isTier('bronze')).toBe(true)
    expect(isTier('platin')).toBe(false)
    expect(isTier(null)).toBe(false)
    expect(isTier(undefined)).toBe(false)
    expect(isTier(3)).toBe(false)
  })
})

describe('rangMapFromRows', () => {
  it('baut content_id -> Tier und verwirft null/ungueltig', () => {
    const m = rangMapFromRows([
      { content_id: 'a', rang: 'gold' },
      { content_id: 'b', rang: 'silber' },
      { content_id: 'c', rang: null },
      { content_id: 'd', rang: 'platin' },
    ])
    expect(m.get('a')).toBe('gold')
    expect(m.get('b')).toBe('silber')
    expect(m.has('c')).toBe(false)
    expect(m.has('d')).toBe(false)
    expect(m.size).toBe(2)
  })

  it('leer/null -> leere Map', () => {
    expect(rangMapFromRows(null).size).toBe(0)
    expect(rangMapFromRows(undefined).size).toBe(0)
    expect(rangMapFromRows([]).size).toBe(0)
  })
})
