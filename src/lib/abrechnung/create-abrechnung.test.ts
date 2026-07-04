import { describe, it, expect, vi } from 'vitest'
import { createAbrechnung, type AbrechnungDescriptor } from './create-abrechnung'

vi.mock('@/lib/billing/generate-rechnungs-nr', () => ({
  nextRechnungsNrRaw: vi.fn().mockResolvedValue(7),
}))

function fakeDb(inserts: Record<string, unknown[]>) {
  return {
    from: (t: string) => ({
      insert: (row: unknown) => {
        inserts[t] = inserts[t] ?? []
        if (Array.isArray(row)) inserts[t].push(...row); else inserts[t].push(row)
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'HDR-1' }, error: null }) }) }
      },
    }),
  } as any
}
const desc: AbrechnungDescriptor = {
  zielTabelle: 'abrechnungen', positionenTabelle: 'abrechnung_positionen', positionsFkSpalte: 'abrechnung_id',
  nummer: () => ({ serie: 'CMNDO-05', jahr: 2026, format: (j, n) => `CMNDO-${j}-05-${String(n).padStart(4, '0')}` }),
  buildHeaderRow: (b) => ({ empfaenger_typ: 'sv', abrechnungs_nr: b.nummer, summe_netto: b.nettoCent / 100, ust_betrag: b.ustCent / 100, summe_brutto: b.bruttoCent / 100 }),
  buildPositionRow: (p, id) => ({ abrechnung_id: id, betrag_netto: (p.betrag_netto_cent as number) / 100 }),
}

describe('createAbrechnung', () => {
  it('summiert Netto in Cent, rechnet USt Cent-Pfad, allokiert Nummer, inserted Header+Positionen', async () => {
    const inserts: Record<string, unknown[]> = {}
    const r = await createAbrechnung(fakeDb(inserts), desc, {
      positionen: [{ betrag_netto_cent: 15000 }, { betrag_netto_cent: 7000 }], kontext: {},
    })
    expect(r).toMatchObject({ ok: true, erstellt: true, id: 'HDR-1', nummer: 'CMNDO-2026-05-0007' })
    if (r.ok && r.erstellt) expect(r.betraege).toMatchObject({ nettoCent: 22000, ustCent: 4180, bruttoCent: 26180, ustSatz: 19 })
    expect(inserts['abrechnungen']).toHaveLength(1)
    expect(inserts['abrechnung_positionen']).toHaveLength(2)
  })
  it('Dedup-Treffer -> erstellt:false, kein Insert', async () => {
    const inserts: Record<string, unknown[]> = {}
    const r = await createAbrechnung(fakeDb(inserts), { ...desc, pruefeBestehend: () => Promise.resolve('EXIST-9') }, { positionen: [{ betrag_netto_cent: 100 }], kontext: {} })
    expect(r).toEqual({ ok: true, erstellt: false, bestehendeId: 'EXIST-9' })
    expect(inserts['abrechnungen']).toBeUndefined()
  })
})
