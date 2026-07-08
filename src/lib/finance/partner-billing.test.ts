import { describe, it, expect } from 'vitest'
import { buildGutschriftDocsByLedger, belegeFuerZeile, type GutschriftRohzeile } from './partner-billing'
import type { PartnerBillingRow } from './partner-billing'

const base = { ledger_tabelle: 'partner_provisionen', ledger_id: 'led-1' }

describe('buildGutschriftDocsByLedger', () => {
  it('stornierte Original + Storno + korrigierte Original → 3 Belege, storno.bezugNr = Original-Nr', () => {
    const rows: GutschriftRohzeile[] = [
      { id: 'o1', gutschrift_nr: 'CMNDO-GS-2026-00001', typ: 'gutschrift', status: 'storniert', bezug_gutschrift_id: null, ...base },
      { id: 's1', gutschrift_nr: 'CMNDO-GS-2026-00002', typ: 'storno', status: 'versendet', bezug_gutschrift_id: 'o1', ...base },
      { id: 'k1', gutschrift_nr: 'CMNDO-GS-2026-00003', typ: 'gutschrift', status: 'versendet', bezug_gutschrift_id: null, ...base },
    ]
    const map = buildGutschriftDocsByLedger(rows)
    expect(map['partner_provisionen:led-1'].belege).toEqual([
      { gutschriftId: 'o1', nr: 'CMNDO-GS-2026-00001', typ: 'gutschrift', status: 'storniert', bezugNr: null },
      { gutschriftId: 's1', nr: 'CMNDO-GS-2026-00002', typ: 'storno', status: 'versendet', bezugNr: 'CMNDO-GS-2026-00001' },
      { gutschriftId: 'k1', nr: 'CMNDO-GS-2026-00003', typ: 'gutschrift', status: 'versendet', bezugNr: null },
    ])
  })

  it('nur original → ein Beleg', () => {
    const rows: GutschriftRohzeile[] = [
      { id: 'o1', gutschrift_nr: 'CMNDO-GS-2026-00001', typ: 'gutschrift', status: 'versendet', bezug_gutschrift_id: null, ...base },
    ]
    expect(buildGutschriftDocsByLedger(rows)['partner_provisionen:led-1'].belege).toHaveLength(1)
  })

  it('leer → {}', () => {
    expect(buildGutschriftDocsByLedger([])).toEqual({})
  })

  it('storno mit unauffindbarem Bezug → bezugNr null', () => {
    const rows: GutschriftRohzeile[] = [
      { id: 's1', gutschrift_nr: 'CMNDO-GS-2026-00002', typ: 'storno', status: 'versendet', bezug_gutschrift_id: 'missing', ...base },
    ]
    expect(buildGutschriftDocsByLedger(rows)['partner_provisionen:led-1'].belege[0].bezugNr).toBeNull()
  })
})

const auszahlung = (status: string): PartnerBillingRow =>
  ({ richtung: 'auszahlung', status_norm: status, quelle_tabelle: 'partner_provisionen', quelle_id: 'led-1' }) as PartnerBillingRow

describe('belegeFuerZeile', () => {
  it('erledigt + Liste → alle Belege chronologisch, je mit gutschriftId', () => {
    const docs = {
      'partner_provisionen:led-1': {
        belege: [
          { gutschriftId: 'k1', nr: 'CMNDO-GS-2026-00003', typ: 'gutschrift' as const, status: 'versendet', bezugNr: null },
          { gutschriftId: 'o1', nr: 'CMNDO-GS-2026-00001', typ: 'gutschrift' as const, status: 'storniert', bezugNr: null },
          { gutschriftId: 's1', nr: 'CMNDO-GS-2026-00002', typ: 'storno' as const, status: 'versendet', bezugNr: 'CMNDO-GS-2026-00001' },
        ],
      },
    }
    const b = belegeFuerZeile(auszahlung('erledigt'), docs)
    expect(b.map((x) => x.nr)).toEqual(['CMNDO-GS-2026-00001', 'CMNDO-GS-2026-00002', 'CMNDO-GS-2026-00003'])
    expect(b.every((x) => !!x.gutschriftId)).toBe(true)
  })

  it('forderung / offen → keine Belege', () => {
    const row = { richtung: 'forderung', status_norm: 'offen', quelle_tabelle: 'abrechnungen', quelle_id: 'x' } as PartnerBillingRow
    expect(belegeFuerZeile(row, {})).toEqual([])
  })

  it('kein Doc in der Map → leer', () => {
    expect(belegeFuerZeile(auszahlung('storniert'), {})).toEqual([])
  })
})
