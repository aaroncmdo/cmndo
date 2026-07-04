import { describe, it, expect, vi } from 'vitest'
import { FINANCE } from '@/lib/finance/constants'
import { calculateUst, eurToCent, centToEur } from '@/lib/billing/calculate-ust'
import { EMBED_DESCRIPTOR } from './embed'
import { createAbrechnung } from '@/lib/abrechnung/create-abrechnung'

vi.mock('@/lib/billing/generate-rechnungs-nr', () => ({
  nextRechnungsNrRaw: vi.fn().mockResolvedValue(5),
}))

// ---------- Fake-DB recorder (same pattern as create-abrechnung.test.ts) ----------

function fakeDb(inserts: Record<string, unknown[]>, queryOverride?: { data: unknown }) {
  return {
    from: (t: string) => ({
      insert: (row: unknown) => {
        inserts[t] = inserts[t] ?? []
        if (Array.isArray(row)) inserts[t].push(...row)
        else inserts[t].push(row)
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'EMB-HDR-1' }, error: null }),
          }),
        }
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            like: () => ({
              neq: () => ({
                limit: () => ({
                  maybeSingle: () =>
                    Promise.resolve({ data: queryOverride?.data ?? null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
      update: (_payload: unknown) => ({
        in: (_col: string, _ids: string[]) => Promise.resolve({ error: null }),
      }),
    }),
  } as any
}

// ---------- Shared kontext builder ----------

function makeKontext(
  positionen: Array<{ betrag_netto_cent: number } & Record<string, unknown>>,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const now = new Date()
  const monat = now.getMonth() + 1
  const jahr = now.getFullYear()
  const monatPad = String(monat).padStart(2, '0')
  const monthStartDate = new Date(jahr, monat - 1, 1).toISOString().slice(0, 10)
  const monthEndDate = new Date(jahr, monat, 0).toISOString().slice(0, 10)
  const faelligAm = new Date(jahr, monat, 14)
  return {
    sv_id: 'sv-profile-id',
    sv_db_id: 'sv-db-id',
    empfaenger_email: 'sv@example.com',
    empfaenger_name: 'Max Muster',
    jahr,
    monatPad,
    abrechnungs_zeitraum_start: monthStartDate,
    abrechnungs_zeitraum_ende: monthEndDate,
    faellig_am: faelligAm.toISOString().slice(0, 10),
    versand_datum: now.toISOString(),
    anfrage_ids: positionen.map((p) => p.anfrage_id as string),
    ...overrides,
  }
}

// ---------- Tests ----------

describe('EMBED_DESCRIPTOR golden test', () => {
  /**
   * Old route formula (float-based):
   *   summeNetto = N * 70
   *   ustBetrag  = Math.round((summeNetto * FINANCE.MWST_PROZENT / 100) * 100) / 100
   *   summeBrutto = Math.round((summeNetto + ustBetrag) * 100) / 100
   *
   * For whole-euro nettos (N * 70, always whole EUR) the cent-path is byte-identical:
   *   nettoCent = N * 7000
   *   ustCent   = Math.round(nettoCent * 19 / 100)   (= N * 1330, always integer)
   *   bruttoCent = nettoCent + ustCent
   *
   * Both round identically because N*70 has no fractional cent component.
   */
  it('cent amounts are byte-identical to old inline formula for whole-euro sums (N=3 * 70 EUR)', async () => {
    const N = 3
    const einzelpreisEur = 70
    const summeNettoEur = N * einzelpreisEur

    // Old route formula
    const oldUstBetrag = Math.round((summeNettoEur * FINANCE.MWST_PROZENT) / 100 * 100) / 100
    const oldSummeBrutto = Math.round((summeNettoEur + oldUstBetrag) * 100) / 100

    // New cent-path via createAbrechnung
    const positionen = Array.from({ length: N }, (_, i) => ({
      betrag_netto_cent: eurToCent(einzelpreisEur),
      position_nr: i + 1,
      anfrage_id: `anfrage-${i}`,
      termin_id: null,
      embed_site_id: 'site-1',
      site_name: 'TestSite',
      datum: '2026-07-01',
      kunde_name: `Kunde ${i}`,
      schadentyp: 'Heckschaden',
    }))
    const kontext = makeKontext(positionen)

    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, EMBED_DESCRIPTOR, { positionen, kontext })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    if (!result.erstellt) throw new Error('should be erstellt:true')

    // Byte-identical: centToEur must equal the old float values exactly
    expect(centToEur(result.betraege.nettoCent)).toBe(summeNettoEur)                // 210
    expect(centToEur(result.betraege.ustCent)).toBe(oldUstBetrag)                   // 39.90
    expect(centToEur(result.betraege.bruttoCent)).toBe(oldSummeBrutto)              // 249.90

    // Old formula values documented explicitly
    expect(summeNettoEur).toBe(210)
    expect(oldUstBetrag).toBe(39.9)
    expect(oldSummeBrutto).toBe(249.9)
  })

  it('Cent USt via calculateUst matches old formula for N=1 (70 EUR)', () => {
    const einzelpreisEur = 70
    const nettoCent = eurToCent(einzelpreisEur) // 7000

    // Old float formula
    const oldUst = Math.round((einzelpreisEur * FINANCE.MWST_PROZENT) / 100 * 100) / 100

    // New cent path
    const { ust_cent, brutto_cent } = calculateUst(nettoCent, 19)

    expect(centToEur(ust_cent)).toBe(oldUst)                         // 13.30
    expect(centToEur(brutto_cent)).toBe(einzelpreisEur + oldUst)     // 83.30
  })

  it('abrechnungs_nr format matches CMNDO-EMB-{YYYY}-{MM}-{pad3}', async () => {
    const positionen = [
      {
        betrag_netto_cent: eurToCent(70),
        position_nr: 1,
        anfrage_id: 'anfrage-x',
        termin_id: null,
        embed_site_id: 'site-1',
        site_name: null,
        datum: null,
        kunde_name: 'Test Kunde',
        schadentyp: null,
      },
    ]
    const kontext = makeKontext(positionen, { jahr: 2026, monatPad: '07' })

    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, EMBED_DESCRIPTOR, { positionen, kontext })

    if (!result.ok || !result.erstellt) throw new Error('unexpected result')
    // nextRechnungsNrRaw mocked to 5 -> CMNDO-EMB-2026-07-005
    expect(result.nummer).toBe('CMNDO-EMB-2026-07-005')
    expect(result.nummer).toMatch(/^CMNDO-EMB-\d{4}-\d{2}-\d{3}$/)
  })

  it('dedup: pruefeBestehend returns bestehendeId when Rechnung exists, no second insert', async () => {
    const positionen = [
      {
        betrag_netto_cent: eurToCent(70),
        position_nr: 1,
        anfrage_id: 'anfrage-dup',
        termin_id: null,
        embed_site_id: 'site-1',
        site_name: null,
        datum: null,
        kunde_name: 'Dup Kunde',
        schadentyp: null,
      },
    ]
    const kontext = makeKontext(positionen)

    const inserts: Record<string, unknown[]> = {}
    // Simulate existing invoice in DB
    const db = fakeDb(inserts, { data: { id: 'EXIST-EMB-42' } })
    const result = await createAbrechnung(db, EMBED_DESCRIPTOR, { positionen, kontext })

    expect(result).toEqual({ ok: true, erstellt: false, bestehendeId: 'EXIST-EMB-42' })
    expect(inserts['abrechnungen']).toBeUndefined()
    expect(inserts['embed_abrechnung_positionen']).toBeUndefined()
  })

  it('buildPositionRow maps embed_abrechnung_positionen columns correctly', () => {
    const position = {
      betrag_netto_cent: eurToCent(70),
      position_nr: 2,
      anfrage_id: 'anfrage-pos-1',
      termin_id: 'termin-1',
      embed_site_id: 'site-xyz',
      site_name: 'MySite',
      datum: '2026-07-10',
      kunde_name: 'Anna Beispiel',
      schadentyp: 'Frontschaden',
    }

    const row = EMBED_DESCRIPTOR.buildPositionRow!(position, 'HDR-ID', {})

    expect(row).toMatchObject({
      abrechnung_id: 'HDR-ID',
      embed_site_id: 'site-xyz',
      anfrage_id: 'anfrage-pos-1',
      termin_id: 'termin-1',
      einzelpreis_eur: 70,  // centToEur(7000) = 70 EUR
    })
    expect(row.einzelpreis_eur).toBe(70)
    expect(row.leistung_text).toBe('Monika-Vermittlung: Anna Beispiel (Frontschaden)')
  })

  it('buildHeaderRow embeds positionen JSONB and all header columns', () => {
    const betraege = {
      nettoCent: eurToCent(140),
      ustCent: calculateUst(eurToCent(140), 19).ust_cent,
      bruttoCent: calculateUst(eurToCent(140), 19).brutto_cent,
      ustSatz: 19,
      nummer: 'CMNDO-EMB-2026-07-001',
    }
    const positionen = [
      {
        betrag_netto_cent: eurToCent(70),
        position_nr: 1,
        anfrage_id: 'a1',
        termin_id: null,
        embed_site_id: 's1',
        site_name: 'Site1',
        datum: '2026-07-01',
        kunde_name: 'Kunde 1',
        schadentyp: null,
      },
      {
        betrag_netto_cent: eurToCent(70),
        position_nr: 2,
        anfrage_id: 'a2',
        termin_id: 'term-2',
        embed_site_id: 's1',
        site_name: 'Site1',
        datum: '2026-07-05',
        kunde_name: 'Kunde 2',
        schadentyp: 'Seitenschaden',
      },
    ]
    const kontext = makeKontext(positionen)

    const row = EMBED_DESCRIPTOR.buildHeaderRow(betraege, positionen, kontext)

    expect(row).toMatchObject({
      empfaenger_typ: 'sv',
      empfaenger_id: 'sv-db-id',
      empfaenger_email: 'sv@example.com',
      empfaenger_name: 'Max Muster',
      abrechnungs_nr: 'CMNDO-EMB-2026-07-001',
      summe_netto: 140,
      ust_satz: 19.0,
      ust_betrag: centToEur(calculateUst(eurToCent(140), 19).ust_cent),
      summe_brutto: centToEur(calculateUst(eurToCent(140), 19).brutto_cent),
      status: 'versendet',
    })
    expect(Array.isArray(row.positionen)).toBe(true)
    expect((row.positionen as unknown[]).length).toBe(2)
  })
})
