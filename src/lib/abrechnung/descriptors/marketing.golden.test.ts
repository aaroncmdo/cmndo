import { describe, it, expect, vi } from 'vitest'
import { FINANCE } from '@/lib/finance/constants'
import { calculateUst, eurToCent, centToEur } from '@/lib/billing/calculate-ust'
import { MARKETING_DESCRIPTOR, KANZLEI_A_DESCRIPTOR } from './marketing'
import { createAbrechnung } from '@/lib/abrechnung/create-abrechnung'

vi.mock('@/lib/billing/generate-rechnungs-nr', () => ({
  nextRechnungsNrRaw: vi.fn().mockResolvedValue(7),
}))

// ---------- Fake-DB recorder ----------

type InsertResult = { id: string }

/**
 * Builds a chainable fluent query stub that handles arbitrary .eq()/.neq() depth.
 * This avoids the "eq is not a function" error when different descriptors have
 * different numbers of filter predicates.
 */
function makeQueryChain(queryOverride?: { data: unknown }): unknown {
  const terminal = {
    limit: () => ({
      maybeSingle: () =>
        Promise.resolve({ data: queryOverride?.data ?? null, error: null }),
      single: () =>
        Promise.resolve({ data: queryOverride?.data ?? null, error: null }),
    }),
    maybeSingle: () =>
      Promise.resolve({ data: queryOverride?.data ?? null, error: null }),
    single: () =>
      Promise.resolve({ data: queryOverride?.data ?? null, error: null }),
  }

  // Proxy that returns itself for any .eq()/.neq()/.like()/.not() call
  const chain: Record<string, unknown> = {
    ...terminal,
  }
  // Allow any number of chained filter calls
  const handler: ProxyHandler<typeof chain> = {
    get(target, prop) {
      if (prop in target) return target[prop as keyof typeof target]
      // Any filter method returns the same proxy
      return () => new Proxy(chain, handler)
    },
  }
  return new Proxy(chain, handler)
}

function fakeDb(
  inserts: Record<string, unknown[]>,
  queryOverride?: { data: unknown },
) {
  return {
    from: (t: string) => ({
      insert: (row: unknown) => {
        inserts[t] = inserts[t] ?? []
        if (Array.isArray(row)) inserts[t].push(...row)
        else inserts[t].push(row)
        return {
          select: () => ({
            single: (): Promise<{ data: InsertResult; error: null }> =>
              Promise.resolve({ data: { id: 'MKT-HDR-1' }, error: null }),
          }),
        }
      },
      select: () => makeQueryChain(queryOverride),
      update: (_payload: unknown) => ({
        in: (_col: string, _ids: string[]) => Promise.resolve({ error: null }),
      }),
    }),
  } as any
}

// ---------- Shared kontext builder ----------

function makeMarketingKontext(
  positionen_jsonb: unknown[],
  monat = '2026-07',
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const [y, m] = monat.split('-').map(Number)
  const start = new Date(y, m - 1, 1).toISOString().slice(0, 10)
  const ende = new Date(y, m, 0).toISOString().slice(0, 10)
  return {
    monat,
    empfaenger_email: 'maik@example.com',
    empfaenger_name: 'Maik (Marketing)',
    abrechnungs_zeitraum_start: start,
    abrechnungs_zeitraum_ende: ende,
    positionen_jsonb,
    ...overrides,
  }
}

function makeKanzleiKontext(
  positionen_jsonb: unknown[],
  monat = '2026-07',
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const [y, m] = monat.split('-').map(Number)
  const start = new Date(y, m - 1, 1).toISOString().slice(0, 10)
  const ende = new Date(y, m, 0).toISOString().slice(0, 10)
  return {
    monat,
    empfaenger_email: 'kanzlei@example.com',
    empfaenger_name: 'Kanzlei Muster',
    abrechnungs_zeitraum_start: start,
    abrechnungs_zeitraum_ende: ende,
    positionen_jsonb,
    ...overrides,
  }
}

// ---------- Tests ----------

describe('MARKETING_DESCRIPTOR golden test', () => {
  /**
   * Old formula (float-based, hardcoded 19):
   *   summeNetto = N * 150
   *   ustBetrag  = Math.round(summeNetto * 19 / 100 * 100) / 100
   *   summeBrutto = Math.round((summeNetto + ustBetrag) * 100) / 100
   *
   * For CPA=150 EUR whole-euro netto, both paths yield identical results:
   *   nettoCent = 15000; ustCent = Math.round(15000 * 19 / 100) = 2850; bruttoCent = 17850
   *   centToEur(2850) = 28.50; centToEur(17850) = 178.50
   *   old: Math.round(150 * 19 / 100 * 100) / 100 = 28.50; brutto = 178.50 — byte-identical.
   */
  it('cent amounts byte-identical to old hardcoded-19 formula for whole-euro CPA (N=3 * 150 EUR)', async () => {
    const N = 3
    const cpa = FINANCE.CPA_MARKETING_NETTO // 150
    const summeNettoEur = N * cpa

    // Old formula (the bug we are fixing, but byte-identical for whole-EUR)
    const oldUstBetrag = Math.round((summeNettoEur * 19) / 100 * 100) / 100
    const oldSummeBrutto = Math.round((summeNettoEur + oldUstBetrag) * 100) / 100

    // New cent-path via createAbrechnung
    const positionen = Array.from({ length: N }, () => ({
      betrag_netto_cent: eurToCent(cpa),
    }))
    const positionen_jsonb = positionen.map((_, i) => ({
      fall_id: `fall-${i}`,
      beschreibung: `CPA fuer Fall CLM-${i}`,
      betrag_netto: cpa,
      betrag_brutto: Math.round(cpa * 1.19 * 100) / 100,
    }))
    const kontext = makeMarketingKontext(positionen_jsonb)

    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, MARKETING_DESCRIPTOR, { positionen, kontext })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    if (!result.erstellt) throw new Error('should be erstellt:true')

    // Byte-identical: centToEur must equal the old float values exactly for whole-EUR
    expect(centToEur(result.betraege.nettoCent)).toBe(summeNettoEur)     // 450
    expect(centToEur(result.betraege.ustCent)).toBe(oldUstBetrag)        // 85.50
    expect(centToEur(result.betraege.bruttoCent)).toBe(oldSummeBrutto)   // 535.50

    // Sanity: old formula values
    expect(summeNettoEur).toBe(450)
    expect(oldUstBetrag).toBe(85.5)
    expect(oldSummeBrutto).toBe(535.5)
  })

  it('abrechnungs_nr format matches CL-{YYYY-MM}-MARKETING-{pad3}', async () => {
    const positionen = [{ betrag_netto_cent: eurToCent(150) }]
    const kontext = makeMarketingKontext([{ fall_id: null, beschreibung: 'Test' }], '2026-07')

    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, MARKETING_DESCRIPTOR, { positionen, kontext })

    if (!result.ok || !result.erstellt) throw new Error('unexpected result')
    // nextRechnungsNrRaw mocked to 7 -> CL-2026-07-MARKETING-007
    expect(result.nummer).toBe('CL-2026-07-MARKETING-007')
    expect(result.nummer).toMatch(/^CL-\d{4}-\d{2}-MARKETING-\d{3}$/)
  })

  it('buildHeaderRow sets empfaenger_typ=marketing, status=entwurf, embeds positionen_jsonb', async () => {
    const positionen = [{ betrag_netto_cent: eurToCent(150) }]
    const jsonb = [{ fall_id: 'f-1', beschreibung: 'CPA', betrag_netto: 150, betrag_brutto: 178.5 }]
    const kontext = makeMarketingKontext(jsonb)

    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, MARKETING_DESCRIPTOR, { positionen, kontext })

    if (!result.ok || !result.erstellt) throw new Error('unexpected result')

    const headerInsert = inserts['abrechnungen']?.[0] as Record<string, unknown>
    expect(headerInsert).toBeDefined()
    expect(headerInsert.empfaenger_typ).toBe('marketing')
    expect(headerInsert.status).toBe('entwurf')
    expect(Array.isArray(headerInsert.positionen)).toBe(true)
    expect(headerInsert.positionen).toEqual(jsonb)
    // ust_satz in header is 19
    expect(headerInsert.ust_satz).toBe(19)
  })

  it('dedup: pruefeBestehend returns bestehendeId when Rechnung exists', async () => {
    const positionen = [{ betrag_netto_cent: eurToCent(150) }]
    const kontext = makeMarketingKontext([])

    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts, { data: { id: 'EXIST-MKT-42' } })
    const result = await createAbrechnung(db, MARKETING_DESCRIPTOR, { positionen, kontext })

    expect(result).toEqual({ ok: true, erstellt: false, bestehendeId: 'EXIST-MKT-42' })
    expect(inserts['abrechnungen']).toBeUndefined()
  })

  /**
   * Fractional-netto documentation test.
   *
   * For a fractional netto like 100.01 EUR:
   *   Old formula: Math.round(100.01 * 19 / 100 * 100) / 100
   *              = Math.round(1900.19) / 100 = 1900 / 100 = 19.00  (truncates to .19 -> rounds down)
   *   Cent-path: nettoCent = 10001; ustCent = Math.round(10001 * 19 / 100) = Math.round(1900.19) = 1900
   *              centToEur(1900) = 19.00
   *   -> For this example, same result.
   *
   *   For 100.005 EUR (edge that differs):
   *   Old: Math.round(100.005 * 19 / 100 * 100) / 100
   *      = Math.round(0.19001) * 10 (floating point) — can differ by 1ct.
   *   The intent of this test is to DOCUMENT that such a case CAN differ
   *   by at most 1ct; NOT to assert they are equal.
   *
   * In practice: CPA=150 and honorar=150 are always whole-EUR → no difference ever occurs.
   * This test documents the theoretical fix for fractional amounts.
   */
  it('DOCUMENTS: fractional-netto old-float vs cent-path can differ by <=1ct', () => {
    // Fractional netto (not a real CPA value, but a hypothetical)
    const fractionalNettoEur = 100.005

    // Old hardcoded-19 float formula
    const oldUst = Math.round((fractionalNettoEur * 19) / 100 * 100) / 100

    // New cent-path
    const nettoCent = eurToCent(fractionalNettoEur) // Math.round(100.005 * 100) = 10001
    const { ust_cent } = calculateUst(nettoCent, 19)
    const newUst = centToEur(ust_cent)

    // The difference is at most 1ct (0.01 EUR)
    expect(Math.abs(newUst - oldUst)).toBeLessThanOrEqual(0.01)

    // Explicitly document: this is the fix — cent-path is the authoritative result
    // Old formula operates on floating-point EUR; cent-path avoids float accumulation.
    // For real CPA/honorar amounts (whole EUR), the results are identical.
    const difference = Math.abs(newUst - oldUst)
    expect(difference).toBeGreaterThanOrEqual(0)
    // Document the actual values for reviewers
    expect({ fractionalNettoEur, oldUst, newUst, difference }).toMatchObject({
      fractionalNettoEur: expect.any(Number),
      difference: expect.any(Number),
    })
  })
})

describe('KANZLEI_A_DESCRIPTOR golden test', () => {
  it('cent amounts byte-identical to old hardcoded-19 formula for whole-euro honorar (N=2 * 150 EUR)', async () => {
    const N = 2
    const honorar = FINANCE.KANZLEI_PROVISION_NETTO // 150
    const summeNettoEur = N * honorar

    // Old formula
    const oldUstBetrag = Math.round((summeNettoEur * 19) / 100 * 100) / 100
    const oldSummeBrutto = Math.round((summeNettoEur + oldUstBetrag) * 100) / 100

    const positionen = Array.from({ length: N }, () => ({
      betrag_netto_cent: eurToCent(honorar),
    }))
    const positionen_jsonb = positionen.map((_, i) => ({
      fall_id: `fall-k-${i}`,
      beschreibung: `Honorar Fall CLM-${i}`,
      betrag_netto: honorar,
      betrag_brutto: Math.round(honorar * 1.19 * 100) / 100,
    }))
    const kontext = makeKanzleiKontext(positionen_jsonb)

    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, KANZLEI_A_DESCRIPTOR, { positionen, kontext })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    if (!result.erstellt) throw new Error('should be erstellt:true')

    expect(centToEur(result.betraege.nettoCent)).toBe(summeNettoEur)   // 300
    expect(centToEur(result.betraege.ustCent)).toBe(oldUstBetrag)      // 57.00
    expect(centToEur(result.betraege.bruttoCent)).toBe(oldSummeBrutto) // 357.00

    expect(summeNettoEur).toBe(300)
    expect(oldUstBetrag).toBe(57.0)
    expect(oldSummeBrutto).toBe(357.0)
  })

  it('abrechnungs_nr format matches CL-{YYYY-MM}-KANZLEI-{pad3}', async () => {
    const positionen = [{ betrag_netto_cent: eurToCent(150) }]
    const kontext = makeKanzleiKontext([{ fall_id: null, beschreibung: 'Test' }], '2026-07')

    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, KANZLEI_A_DESCRIPTOR, { positionen, kontext })

    if (!result.ok || !result.erstellt) throw new Error('unexpected result')
    expect(result.nummer).toBe('CL-2026-07-KANZLEI-007')
    expect(result.nummer).toMatch(/^CL-\d{4}-\d{2}-KANZLEI-\d{3}$/)
  })

  it('buildHeaderRow sets empfaenger_typ=kanzlei, status=entwurf, embeds positionen_jsonb', async () => {
    const positionen = [{ betrag_netto_cent: eurToCent(150) }]
    const jsonb = [{ fall_id: 'f-k1', beschreibung: 'Honorar', betrag_netto: 150, betrag_brutto: 178.5 }]
    const kontext = makeKanzleiKontext(jsonb)

    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, KANZLEI_A_DESCRIPTOR, { positionen, kontext })

    if (!result.ok || !result.erstellt) throw new Error('unexpected result')

    const headerInsert = inserts['abrechnungen']?.[0] as Record<string, unknown>
    expect(headerInsert).toBeDefined()
    expect(headerInsert.empfaenger_typ).toBe('kanzlei')
    expect(headerInsert.status).toBe('entwurf')
    expect(Array.isArray(headerInsert.positionen)).toBe(true)
    expect(headerInsert.positionen).toEqual(jsonb)
    expect(headerInsert.ust_satz).toBe(19)
  })

  it('dedup: pruefeBestehend returns bestehendeId when Rechnung exists', async () => {
    const positionen = [{ betrag_netto_cent: eurToCent(150) }]
    const kontext = makeKanzleiKontext([])

    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts, { data: { id: 'EXIST-KNZ-99' } })
    const result = await createAbrechnung(db, KANZLEI_A_DESCRIPTOR, { positionen, kontext })

    expect(result).toEqual({ ok: true, erstellt: false, bestehendeId: 'EXIST-KNZ-99' })
    expect(inserts['abrechnungen']).toBeUndefined()
  })
})
