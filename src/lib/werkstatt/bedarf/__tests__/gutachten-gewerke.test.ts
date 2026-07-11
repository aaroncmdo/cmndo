import { describe, it, expect } from 'vitest'
import { deriveGewerkeAusGutachten } from '../gutachten-gewerke'

describe('deriveGewerkeAusGutachten', () => {
  it('Stunden > 0 -> Gewerk', () => {
    expect(deriveGewerkeAusGutachten({ zeit_kar_std: 4.5, zeit_lack_std: 2, zeit_ak_std: 0 }))
      .toEqual(['karosserie', 'lackierung'])
  })
  it('null/0 -> kein Gewerk', () => {
    expect(deriveGewerkeAusGutachten({ zeit_kar_std: null, zeit_lack_std: 0, zeit_ak_std: null })).toEqual([])
  })
  it('String-Stunden (Type-Lag) werden geparst', () => {
    expect(deriveGewerkeAusGutachten({ zeit_kar_std: '0', zeit_lack_std: '3.0', zeit_ak_std: '1' }))
      .toEqual(['lackierung', 'mechanik'])
  })
})
