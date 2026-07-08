import { describe, it, expect } from 'vitest'
import { zaehleZertifikate, ladeSvKandidaten } from '../signals'

describe('zaehleZertifikate', () => {
  it('zaehlt nur vorhandene Nummern', () => {
    expect(zaehleZertifikate({ bvsk_mitgliedsnummer: 'X', dat_nummer: null, ihk_zertifikat_nummer: '', oebuv_bestellungsnummer: 'Y' })).toBe(2)
  })
})

describe('ladeSvKandidaten', () => {
  it('schliesst Testaccounts aus (Filter-Kette wird angewandt)', async () => {
    const calls: Record<string, unknown> = {}
    const svQuery = {
      select: function () { return this },
      is: function (col: string, val: unknown) { calls[`is:${col}`] = val; return this },
      eq: function (col: string, val: unknown) { calls[`eq:${col}`] = val; return this },
      not: function (col: string) { calls[`not:${col}`] = true; return this },
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
    }
    const supabase = { from: () => svQuery } as unknown as Parameters<typeof ladeSvKandidaten>[0]
    const r = await ladeSvKandidaten(supabase)
    expect(r).toEqual([])
    expect(calls['eq:ist_testaccount']).toBe(false)
    expect(calls['is:geloescht_am']).toBeNull()
  })
})
