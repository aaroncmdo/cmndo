import { describe, it, expect } from 'vitest'
import { mapEigeneGutschriften } from '@/lib/finance/eigene-gutschriften-map'

describe('mapEigeneGutschriften', () => {
  it('löst Storno-Bezug (Original-Nr) auf + reicht typ durch', () => {
    const rows = [
      { id: 'o1', gutschrift_nr: 'A', betrag_brutto: 119, erstellt_am: '2026-07-05T10:00:00Z', status: 'storniert', typ: 'gutschrift', bezug_gutschrift_id: null },
      { id: 's1', gutschrift_nr: 'B', betrag_brutto: -119, erstellt_am: '2026-07-07T10:00:00Z', status: 'versendet', typ: 'storno', bezug_gutschrift_id: 'o1' },
    ]
    const out = mapEigeneGutschriften(rows)
    const storno = out.find((g) => g.id === 's1')!
    expect(storno.typ).toBe('storno')
    expect(storno.bezugNr).toBe('A')
    expect(out.find((g) => g.id === 'o1')!.bezugNr).toBeNull()
  })

  it('storno mit unauffindbarem Bezug → bezugNr null', () => {
    const out = mapEigeneGutschriften([
      { id: 's1', gutschrift_nr: 'B', betrag_brutto: -119, erstellt_am: '2026-07-07T10:00:00Z', status: 'versendet', typ: 'storno', bezug_gutschrift_id: 'missing' },
    ])
    expect(out[0].bezugNr).toBeNull()
  })
})
