// Regressions-Guard: die Standard-Staffelung (De-facto-Standard der bestehenden Partner)
// wird bei Neuanlage gesetzt — richtige Tabelle + ID-Spalte + Werte, und NICHT wenn bereits
// Stufen existieren (kein Ueberschreiben admin-gesetzter Staffeln).

import { describe, it, expect, vi } from 'vitest'
import {
  STANDARD_MAKLER_STAFFEL,
  STANDARD_WERKSTATT_STAFFEL,
  setzeStandardStaffel,
} from './standard-staffel'

function mockAdmin(existing: unknown) {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing })
  const selectChain: Record<string, unknown> = { maybeSingle }
  selectChain.select = vi.fn(() => selectChain)
  selectChain.eq = vi.fn(() => selectChain)
  selectChain.limit = vi.fn(() => selectChain)
  const from = vi.fn(() => ({ ...selectChain, insert }))
  return { admin: { from } as never, insert, from }
}

describe('setzeStandardStaffel', () => {
  it('Standard-Konstanten: Makler 5/10/20 -> 100/200/300, Werkstatt 5/10/20 -> 200/250/300', () => {
    expect(STANDARD_MAKLER_STAFFEL).toEqual([
      { schwelle: 5, bonus_betrag_netto: 100 },
      { schwelle: 10, bonus_betrag_netto: 200 },
      { schwelle: 20, bonus_betrag_netto: 300 },
    ])
    expect(STANDARD_WERKSTATT_STAFFEL).toEqual([
      { schwelle: 5, bonus_betrag_netto: 200 },
      { schwelle: 10, bonus_betrag_netto: 250 },
      { schwelle: 20, bonus_betrag_netto: 300 },
    ])
  })

  it('makler: fuegt die Standard-Stufen mit makler_id ein (keine vorhanden)', async () => {
    const { admin, insert, from } = mockAdmin(null)
    await setzeStandardStaffel(admin, 'makler', 'm1')
    expect(from).toHaveBeenCalledWith('makler_staffel_stufen')
    expect(insert).toHaveBeenCalledWith([
      { makler_id: 'm1', schwelle: 5, bonus_betrag_netto: 100 },
      { makler_id: 'm1', schwelle: 10, bonus_betrag_netto: 200 },
      { makler_id: 'm1', schwelle: 20, bonus_betrag_netto: 300 },
    ])
  })

  it('werkstatt: fuegt die Standard-Stufen mit werkstatt_id ein', async () => {
    const { admin, insert, from } = mockAdmin(null)
    await setzeStandardStaffel(admin, 'werkstatt', 'w1')
    expect(from).toHaveBeenCalledWith('werkstatt_staffel_stufen')
    expect(insert).toHaveBeenCalledWith([
      { werkstatt_id: 'w1', schwelle: 5, bonus_betrag_netto: 200 },
      { werkstatt_id: 'w1', schwelle: 10, bonus_betrag_netto: 250 },
      { werkstatt_id: 'w1', schwelle: 20, bonus_betrag_netto: 300 },
    ])
  })

  it('ueberschreibt NICHT wenn bereits Stufen existieren', async () => {
    const { admin, insert } = mockAdmin({ id: 'vorhanden' })
    await setzeStandardStaffel(admin, 'makler', 'm1')
    expect(insert).not.toHaveBeenCalled()
  })

  it('leere partnerId -> no-op', async () => {
    const { admin, from } = mockAdmin(null)
    await setzeStandardStaffel(admin, 'makler', '')
    expect(from).not.toHaveBeenCalled()
  })
})
