import { describe, it, expect } from 'vitest'
import { rangFortschritt } from './compute'
import { DEFAULT_RANG_CONFIG } from './config'

describe('rangFortschritt', () => {
  // Live-getunte Schwellen (DB): Silber 25 / Gold 45.
  const cfg = { ...DEFAULT_RANG_CONFIG, schwelleSilber: 25, schwelleGold: 45 }

  it('gold = Endstufe (kein naechster, 100%)', () => {
    expect(rangFortschritt(80, 'gold', cfg)).toEqual({ naechster: null, prozent: 100 })
  })

  it('silber -> gold, prozent relativ zur Gold-Schwelle', () => {
    expect(rangFortschritt(45, 'silber', cfg)).toEqual({ naechster: 'gold', prozent: 100 })
    expect(rangFortschritt(9, 'silber', cfg)).toEqual({ naechster: 'gold', prozent: 20 })
  })

  it('bronze -> silber, prozent relativ zur Silber-Schwelle', () => {
    expect(rangFortschritt(5, 'bronze', cfg)).toEqual({ naechster: 'silber', prozent: 20 })
  })

  it('prozent auf 0..100 geclamped', () => {
    expect(rangFortschritt(999, 'silber', cfg).prozent).toBe(100)
    expect(rangFortschritt(-5, 'bronze', cfg).prozent).toBe(0)
  })
})
