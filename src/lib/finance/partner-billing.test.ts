import { describe, it, expect } from 'vitest'
import { buildGutschriftDocsByLedger, type GutschriftRohzeile } from './partner-billing'

const base = { ledger_tabelle: 'makler_provisionen', ledger_id: 'led-1' }

describe('buildGutschriftDocsByLedger', () => {
  it('(a) original + storno für einen Ledger → beide + storno.bezugNr = Original-Nr', () => {
    const rows: GutschriftRohzeile[] = [
      { id: 'o1', gutschrift_nr: 'CMNDO-GS-2026-00001', typ: 'gutschrift', bezug_gutschrift_id: null, ...base },
      { id: 's1', gutschrift_nr: 'CMNDO-GS-2026-00002', typ: 'storno', bezug_gutschrift_id: 'o1', ...base },
    ]
    const map = buildGutschriftDocsByLedger(rows)
    expect(map['makler_provisionen:led-1']).toEqual({
      original: { nr: 'CMNDO-GS-2026-00001' },
      storno: { nr: 'CMNDO-GS-2026-00002', bezugNr: 'CMNDO-GS-2026-00001' },
    })
  })

  it('(b) nur original', () => {
    const rows: GutschriftRohzeile[] = [
      { id: 'o1', gutschrift_nr: 'CMNDO-GS-2026-00001', typ: 'gutschrift', bezug_gutschrift_id: null, ...base },
    ]
    expect(buildGutschriftDocsByLedger(rows)).toEqual({
      'makler_provisionen:led-1': { original: { nr: 'CMNDO-GS-2026-00001' } },
    })
  })

  it('(c) leer → {}', () => {
    expect(buildGutschriftDocsByLedger([])).toEqual({})
  })

  it('(d) storno mit unauffindbarem Bezug → bezugNr null', () => {
    const rows: GutschriftRohzeile[] = [
      { id: 's1', gutschrift_nr: 'CMNDO-GS-2026-00002', typ: 'storno', bezug_gutschrift_id: 'missing', ...base },
    ]
    expect(buildGutschriftDocsByLedger(rows)['makler_provisionen:led-1'].storno).toEqual({
      nr: 'CMNDO-GS-2026-00002',
      bezugNr: null,
    })
  })
})
