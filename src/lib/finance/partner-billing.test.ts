import { describe, it, expect } from 'vitest'
import { buildGutschriftDocsByLedger, belegeFuerZeile, type GutschriftRohzeile } from './partner-billing'
import type { PartnerBillingRow } from './partner-billing'

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

const auszahlung = (status: string): PartnerBillingRow =>
  ({ richtung: 'auszahlung', status_norm: status, quelle_tabelle: 'makler_provisionen', quelle_id: 'led-1' }) as PartnerBillingRow

describe('belegeFuerZeile', () => {
  it('storniert + original+storno → beide Belege (gutschrift, storno) mit bezugNr', () => {
    const docs = { 'makler_provisionen:led-1': { original: { nr: 'A' }, storno: { nr: 'B', bezugNr: 'A' } } }
    const b = belegeFuerZeile(auszahlung('storniert'), docs)
    expect(b.map((x) => x.typ)).toEqual(['gutschrift', 'storno'])
    expect(b.find((x) => x.typ === 'storno')?.bezugNr).toBe('A')
  })

  it('erledigt + nur original → ein Beleg', () => {
    const docs = { 'makler_provisionen:led-1': { original: { nr: 'A' } } }
    expect(belegeFuerZeile(auszahlung('erledigt'), docs).map((x) => x.typ)).toEqual(['gutschrift'])
  })

  it('forderung / offen → keine Belege', () => {
    const row = { richtung: 'forderung', status_norm: 'offen', quelle_tabelle: 'abrechnungen', quelle_id: 'x' } as PartnerBillingRow
    expect(belegeFuerZeile(row, {})).toEqual([])
  })

  it('kein Doc in der Map → leer (Alt-Storno / kein Beleg)', () => {
    expect(belegeFuerZeile(auszahlung('storniert'), {})).toEqual([])
  })
})
