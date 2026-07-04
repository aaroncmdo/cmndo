import { describe, it, expect, vi } from 'vitest'
import { FINANCE } from '@/lib/finance/constants'
import { calculateUst, eurToCent, centToEur } from '@/lib/billing/calculate-ust'
import { KANZLEI_DESCRIPTOR } from './kanzlei'
import { createAbrechnung } from '@/lib/abrechnung/create-abrechnung'

vi.mock('@/lib/billing/generate-rechnungs-nr', () => ({
  nextRechnungsNrRaw: vi.fn().mockResolvedValue(3),
}))

// ---------- Fake-DB recorder ----------

function fakeDb(
  inserts: Record<string, unknown[]>,
  queryOverride?: { data: unknown },
  updatedRows?: { table: string; ids: string[] }[],
) {
  return {
    from: (t: string) => ({
      insert: (row: unknown) => {
        inserts[t] = inserts[t] ?? []
        if (Array.isArray(row)) inserts[t].push(...row)
        else inserts[t].push(row)
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'KNZ-HDR-1' }, error: null }),
          }),
        }
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: queryOverride?.data ?? null, error: null }),
              }),
            }),
          }),
        }),
      }),
      update: (_payload: unknown) => ({
        in: (col: string, ids: string[]) => {
          updatedRows?.push({ table: t, ids })
          return Promise.resolve({ error: null })
        },
        eq: (_col: string, _val: unknown) => Promise.resolve({ error: null }),
      }),
    }),
  } as any
}

// ---------- Shared kontext builder ----------

function makeKontext(
  positionen: Array<{ betrag_netto_cent: number } & Record<string, unknown>>,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const heute = new Date()
  const faelligkeitsdatum = new Date(heute.getTime() + 14 * 24 * 60 * 60 * 1000)
  const magicLinkExpires = new Date(faelligkeitsdatum.getTime() + 30 * 24 * 60 * 60 * 1000)
  const claimIds = positionen.map((_, i) => `claim-k-${i}`)
  return {
    kanzlei_id: 'kanzlei-uuid-1',
    monat: 7,
    jahr: 2026,
    monatPad: '07',
    anzahl_vollmachten: positionen.length,
    magic_link_token: 'abc123token',
    magic_link_expires_at: magicLinkExpires.toISOString(),
    faelligkeitsdatum: faelligkeitsdatum.toISOString().slice(0, 10),
    claim_ids: claimIds,
    ...overrides,
  }
}

// ---------- Tests ----------

describe('KANZLEI_DESCRIPTOR golden tests', () => {
  /**
   * Old erstelle-abrechnung.ts formula (float-based):
   *   nettoGesamt = anzahl * BETRAG_PRO_VOLLMACHT_NETTO   (150 EUR per Vollmacht — whole EUR)
   *   mwstBetrag  = Math.round(nettoGesamt * FINANCE.MWST_PROZENT / 100 * 100) / 100
   *   brutto      = Math.round((nettoGesamt + mwstBetrag) * 100) / 100
   *
   * For whole-euro netto (N * 150, always whole EUR) the cent-path is byte-identical:
   *   nettoCent   = N * 15000
   *   ustCent     = Math.round(nettoCent * 19 / 100)   (= N * 2850, always integer)
   *   bruttoCent  = nettoCent + ustCent
   *
   * Both round identically because N*150 has no fractional cent component.
   */
  it('cent amounts are byte-identical to old inline formula for whole-euro sums (N=4 * 150 EUR)', async () => {
    const N = 4
    const betragProVollmachtEur = FINANCE.KANZLEI_PROVISION_NETTO // 150
    const nettoGesamt = N * betragProVollmachtEur // 600 EUR

    // Old erstelle-abrechnung.ts float formula
    const oldMwst = Math.round((nettoGesamt * FINANCE.MWST_PROZENT) / 100 * 100) / 100
    const oldBrutto = Math.round((nettoGesamt + oldMwst) * 100) / 100

    // New cent-path via createAbrechnung + KANZLEI_DESCRIPTOR
    const positionen = Array.from({ length: N }, (_, i) => ({
      betrag_netto_cent: eurToCent(betragProVollmachtEur),
      position_nr: i + 1,
      fall_id: `fall-${i}`,
      fall_nr: `CLM-2026-${String(i).padStart(5, '0')}`,
      kunde_name: `Kunde ${i}`,
      vollmacht_unterschrieben_am: '2026-06-15',
    }))

    const kontext = makeKontext(positionen)
    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, KANZLEI_DESCRIPTOR, { positionen, kontext })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    if (!result.erstellt) throw new Error('should be erstellt:true')

    // Byte-identical: centToEur must equal the old float values exactly
    expect(centToEur(result.betraege.nettoCent)).toBe(nettoGesamt)     // 600
    expect(centToEur(result.betraege.ustCent)).toBe(oldMwst)            // 114
    expect(centToEur(result.betraege.bruttoCent)).toBe(oldBrutto)       // 714

    // Old formula values documented explicitly
    expect(nettoGesamt).toBe(600)
    expect(oldMwst).toBe(114)
    expect(oldBrutto).toBe(714)
  })

  it('N=1 cent amounts are byte-identical (1 * 150 EUR)', async () => {
    const betragProVollmachtEur = FINANCE.KANZLEI_PROVISION_NETTO // 150

    // Old formula
    const oldMwst = Math.round((betragProVollmachtEur * FINANCE.MWST_PROZENT) / 100 * 100) / 100
    const oldBrutto = Math.round((betragProVollmachtEur + oldMwst) * 100) / 100

    // Cent-path
    const { ust_cent, brutto_cent } = calculateUst(eurToCent(betragProVollmachtEur), 19)

    expect(centToEur(ust_cent)).toBe(oldMwst)                          // 28.50
    expect(centToEur(brutto_cent)).toBe(oldBrutto)                     // 178.50
  })

  it('rechnungsnummer format matches CMNDO-K-{jahr}-{MM}-{pad3}', async () => {
    const positionen = [
      {
        betrag_netto_cent: eurToCent(150),
        position_nr: 1,
        fall_id: 'fall-nr-test',
        fall_nr: 'CLM-2026-00001',
        kunde_name: 'Max Mustermann',
        vollmacht_unterschrieben_am: '2026-06-10',
      },
    ]
    const kontext = makeKontext(positionen, { jahr: 2026, monatPad: '07' })
    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, KANZLEI_DESCRIPTOR, { positionen, kontext })

    if (!result.ok || !result.erstellt) throw new Error('unexpected result')
    // nextRechnungsNrRaw mocked to 3 -> CMNDO-K-2026-07-003
    expect(result.nummer).toBe('CMNDO-K-2026-07-003')
    expect(result.nummer).toMatch(/^CMNDO-K-\d{4}-\d{2}-\d{3}$/)
  })

  it('buildHeaderRow sets status offen (two-phase), correct column names', async () => {
    const positionen = [
      {
        betrag_netto_cent: eurToCent(150),
        position_nr: 1,
        fall_id: 'fall-header-test',
        fall_nr: null,
        kunde_name: 'Anna Muster',
        vollmacht_unterschrieben_am: '2026-05-20',
      },
    ]
    const kontext = makeKontext(positionen, { jahr: 2026, monatPad: '07' })
    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    await createAbrechnung(db, KANZLEI_DESCRIPTOR, { positionen, kontext })

    const header = inserts['kanzlei_abrechnungen']?.[0] as Record<string, unknown>
    expect(header).toBeDefined()

    // Two-phase status: must be 'offen' (caller flips to 'versendet' after PDF+mail)
    expect(header.status).toBe('offen')

    // Column names specific to kanzlei_abrechnungen (NOT summe_netto / ust_betrag / summe_brutto)
    expect(header.rechnungsnummer).toBeDefined()
    expect(header.endbetrag_netto).toBe(150)
    expect(header.mwst_betrag).toBe(centToEur(calculateUst(eurToCent(150), 19).ust_cent))
    expect(header.endbetrag_brutto).toBe(centToEur(calculateUst(eurToCent(150), 19).brutto_cent))
    expect(header.betrag_pro_vollmacht_netto).toBe(FINANCE.KANZLEI_PROVISION_NETTO)
    expect(header.kanzlei_id).toBe('kanzlei-uuid-1')
    expect(header.abrechnungsmonat).toBe(7)
    expect(header.abrechnungsjahr).toBe(2026)

    // No 'summe_netto' / 'ust_betrag' / 'summe_brutto' (SV column names must NOT leak in)
    expect(header.summe_netto).toBeUndefined()
    expect(header.ust_betrag).toBeUndefined()
    expect(header.summe_brutto).toBeUndefined()
  })

  it('dedup: pruefeBestehend returns bestehendeId when Abrechnung exists, no insert', async () => {
    const positionen = [
      {
        betrag_netto_cent: eurToCent(150),
        position_nr: 1,
        fall_id: 'fall-dup',
        fall_nr: null,
        kunde_name: 'Dup Kunde',
        vollmacht_unterschrieben_am: '2026-06-01',
      },
    ]
    const kontext = makeKontext(positionen)
    const inserts: Record<string, unknown[]> = {}
    // Simulate existing invoice
    const db = fakeDb(inserts, { data: { id: 'EXIST-KNZ-42' } })
    const result = await createAbrechnung(db, KANZLEI_DESCRIPTOR, { positionen, kontext })

    expect(result).toEqual({ ok: true, erstellt: false, bestehendeId: 'EXIST-KNZ-42' })
    expect(inserts['kanzlei_abrechnungen']).toBeUndefined()
    expect(inserts['kanzlei_abrechnung_positionen']).toBeUndefined()
  })

  it('markiere sets claims.kanzlei_abrechnung_id + kanzlei_provision_status for all claim_ids', async () => {
    const positionen = [
      {
        betrag_netto_cent: eurToCent(150),
        position_nr: 1,
        fall_id: 'fall-mark-1',
        fall_nr: 'CLM-001',
        kunde_name: 'Test Person',
        vollmacht_unterschrieben_am: '2026-06-20',
      },
    ]
    const claimIds = ['claim-knz-a', 'claim-knz-b']
    const kontext = makeKontext(positionen, { claim_ids: claimIds })
    const inserts: Record<string, unknown[]> = {}
    const updatedRows: { table: string; ids: string[] }[] = []
    const db = fakeDb(inserts, undefined, updatedRows)
    const result = await createAbrechnung(db, KANZLEI_DESCRIPTOR, { positionen, kontext })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.erstellt) throw new Error('unexpected result')
    expect(result.markiertOk).toBe(true)

    const claimsUpdate = updatedRows.find((r) => r.table === 'claims')
    expect(claimsUpdate).toBeDefined()
    expect(claimsUpdate?.ids).toEqual(claimIds)
  })

  it('buildPositionRow maps kanzlei_abrechnung_positionen columns correctly', () => {
    const position = {
      betrag_netto_cent: eurToCent(150),
      position_nr: 2,
      fall_id: 'fall-pos-k',
      fall_nr: 'CLM-2026-00099',
      kunde_name: 'Karla Klage',
      vollmacht_unterschrieben_am: '2026-06-25',
    }

    const row = KANZLEI_DESCRIPTOR.buildPositionRow!(position, 'HDR-KNZ', {})

    expect(row).toMatchObject({
      kanzlei_abrechnung_id: 'HDR-KNZ',
      fall_id: 'fall-pos-k',
      fall_nr: 'CLM-2026-00099',
      kunde_name: 'Karla Klage',
      vollmacht_unterschrieben_am: '2026-06-25',
      betrag_netto: 150, // centToEur(15000) = 150
      position_nr: 2,
    })
    expect(row.betrag_netto).toBe(150)
    // FK column must be kanzlei_abrechnung_id (not abrechnung_id)
    expect((row as Record<string, unknown>).abrechnung_id).toBeUndefined()
  })
})
