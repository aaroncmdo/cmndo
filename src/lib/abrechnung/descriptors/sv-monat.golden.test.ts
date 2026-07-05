import { describe, it, expect, vi } from 'vitest'
import { FINANCE } from '@/lib/finance/constants'
import { calculateUst, eurToCent, centToEur } from '@/lib/billing/calculate-ust'
import { SV_MONAT_DESCRIPTOR } from './sv-monat'
import { createAbrechnung } from '@/lib/abrechnung/create-abrechnung'

vi.mock('@/lib/billing/generate-rechnungs-nr', () => ({
  nextRechnungsNrRaw: vi.fn().mockResolvedValue(7),
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
            single: () => Promise.resolve({ data: { id: 'SV-HDR-1' }, error: null }),
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
        in: (col: string, ids: string[]) => {
          updatedRows?.push({ table: t, ids })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  } as any
}

// ---------- Shared kontext builders ----------

function makeIndividualKontext(
  positionen: Array<{ betrag_netto_cent: number } & Record<string, unknown>>,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const now = new Date()
  const monat = now.getMonth() + 1
  const jahr = now.getFullYear()
  const monatPad = String(monat).padStart(2, '0')
  const monthStartDate = new Date(jahr, monat - 1, 1).toISOString().slice(0, 10)
  const monthEndDate = new Date(jahr, monat, 0).toISOString().slice(0, 10)
  const faellig = new Date(jahr, monat, 14)
  const claimIds = positionen.map((_, i) => `claim-${i}`)
  return {
    empfaenger_id: 'sv-db-id',
    empfaenger_email: 'sv@example.com',
    empfaenger_name: 'Max Mustermann',
    jahr,
    monatPad,
    abrechnungs_zeitraum_start: monthStartDate,
    abrechnungs_zeitraum_ende: monthEndDate,
    faellig_am: faellig.toISOString().slice(0, 10),
    versand_datum: now.toISOString(),
    notiz: 'Brutto-Lead-Preise: 450.00 EUR. Verrechnet aus Werbebudget: 0.00 EUR. Restguthaben: 0.00 EUR.',
    claim_ids: claimIds,
    ...overrides,
  }
}

function makeOrgKontext(
  positionen: Array<{ betrag_netto_cent: number } & Record<string, unknown>>,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const base = makeIndividualKontext(positionen, overrides)
  return {
    ...base,
    empfaenger_id: 'org-id-1',
    empfaenger_email: 'verwalter@buero.de',
    empfaenger_name: 'Buero Mustermann GmbH',
    notiz: 'Sammelrechnung fuer Buero Muster. 2 Positionen aus 2 Sub-SVs.',
  }
}

// ---------- Tests ----------

describe('SV_MONAT_DESCRIPTOR golden tests', () => {
  /**
   * Old cron route formula (float-based):
   *   endbetragNetto  = sum(sv_nachzahlung_netto)   [whole EUR in practice]
   *   mwst            = Math.round(endbetragNetto * FINANCE.MWST_PROZENT / 100 * 100) / 100
   *   endbetragBrutto = Math.round((endbetragNetto + mwst) * 100) / 100
   *
   * For whole-euro netto amounts, the cent-path is byte-identical:
   *   nettoCent   = sum(eurToCent(sv_nachzahlung_netto))
   *   ustCent     = Math.round(nettoCent * 19 / 100)
   *   bruttoCent  = nettoCent + ustCent
   *
   * Any fractional cent delta is <=1 ct (documented below).
   */
  it('cent amounts are byte-identical to old inline formula for whole-euro sums (3 * 150 EUR)', async () => {
    const N = 3
    const svNachzahlungEurEach = 150 // whole-euro in practice
    const endbetragNetto = N * svNachzahlungEurEach // 450 EUR

    // Old route float formula
    const oldMwst = Math.round((endbetragNetto * FINANCE.MWST_PROZENT) / 100 * 100) / 100
    const oldBrutto = Math.round((endbetragNetto + oldMwst) * 100) / 100

    // New cent-path via createAbrechnung
    const positionen = Array.from({ length: N }, (_, i) => ({
      betrag_netto_cent: eurToCent(svNachzahlungEurEach),
      position_nr: i + 1,
      fall_id: `fall-${i}`,
      fall_datum: '2026-07-01',
      kennzeichen: `AB-${i}-CD`,
      schadenhoehe_netto: 3000,
      lead_preis_netto: 200,
      lead_preis_typ: 'paket',
      guthaben_verrechnet_netto: 50,
      sv_nachzahlung_netto: svNachzahlungEurEach,
    }))

    const kontext = makeIndividualKontext(positionen, { jahr: 2026, monatPad: '07' })
    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, SV_MONAT_DESCRIPTOR, { positionen, kontext })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    if (!result.erstellt) throw new Error('should be erstellt:true')

    // Byte-identical for whole-euro amounts
    expect(centToEur(result.betraege.nettoCent)).toBe(endbetragNetto)          // 450
    expect(centToEur(result.betraege.ustCent)).toBe(oldMwst)                   // 85.50
    expect(centToEur(result.betraege.bruttoCent)).toBe(oldBrutto)              // 535.50

    // Document concrete values
    expect(endbetragNetto).toBe(450)
    expect(oldMwst).toBe(85.5)
    expect(oldBrutto).toBe(535.5)
  })

  it('fractional-cent delta is <=1 ct for non-whole-euro netto (e.g. 150.33 EUR)', () => {
    // sv_nachzahlung = 150.33 EUR  (2 Nachkommastellen, hypothetisch)
    const svNachzahlungEur = 150.33
    const nettoCent = eurToCent(svNachzahlungEur) // 15033

    // Old float formula
    const oldMwst = Math.round((svNachzahlungEur * FINANCE.MWST_PROZENT) / 100 * 100) / 100
    const oldBrutto = Math.round((svNachzahlungEur + oldMwst) * 100) / 100

    // New cent path
    const { ust_cent, brutto_cent } = calculateUst(nettoCent, 19)

    const centDeltaUst = Math.abs(centToEur(ust_cent) - oldMwst)
    const centDeltaBrutto = Math.abs(centToEur(brutto_cent) - oldBrutto)

    // delta <=1 cent (0.01 EUR) for any fractional input
    expect(centDeltaUst).toBeLessThanOrEqual(0.01)
    expect(centDeltaBrutto).toBeLessThanOrEqual(0.01)
  })

  it('abrechnungs_nr format matches CMNDO-{jahr}-{MM}-{pad4}', async () => {
    const positionen = [
      {
        betrag_netto_cent: eurToCent(200),
        position_nr: 1,
        fall_id: 'fall-x',
        fall_datum: '2026-07-15',
        kennzeichen: 'M-AB-1234',
        schadenhoehe_netto: 5000,
        lead_preis_netto: 200,
        lead_preis_typ: 'paket',
        guthaben_verrechnet_netto: 0,
        sv_nachzahlung_netto: 200,
      },
    ]
    const kontext = makeIndividualKontext(positionen, { jahr: 2026, monatPad: '07' })
    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, SV_MONAT_DESCRIPTOR, { positionen, kontext })

    if (!result.ok || !result.erstellt) throw new Error('unexpected result')
    // nextRechnungsNrRaw mocked to 7 -> CMNDO-2026-07-0007
    expect(result.nummer).toBe('CMNDO-2026-07-0007')
    expect(result.nummer).toMatch(/^CMNDO-\d{4}-\d{2}-\d{4}$/)
  })

  it('dedup: pruefeBestehend returns bestehendeId, no header insert', async () => {
    const positionen = [
      {
        betrag_netto_cent: eurToCent(200),
        position_nr: 1,
        fall_id: 'fall-dup',
        fall_datum: '2026-07-01',
        kennzeichen: null,
        schadenhoehe_netto: 0,
        lead_preis_netto: 200,
        lead_preis_typ: 'paket',
        guthaben_verrechnet_netto: 0,
        sv_nachzahlung_netto: 200,
      },
    ]
    const kontext = makeIndividualKontext(positionen)
    const inserts: Record<string, unknown[]> = {}
    // Simulate existing invoice
    const db = fakeDb(inserts, { data: { id: 'EXIST-SVM-99' } })
    const result = await createAbrechnung(db, SV_MONAT_DESCRIPTOR, { positionen, kontext })

    expect(result).toEqual({ ok: true, erstellt: false, bestehendeId: 'EXIST-SVM-99' })
    // No insert should have happened
    expect(inserts['abrechnungen']).toBeUndefined()
    expect(inserts['abrechnung_positionen']).toBeUndefined()
  })

  it('markiere sets claims.abrechnung_id for all claim_ids', async () => {
    const positionen = [
      {
        betrag_netto_cent: eurToCent(300),
        position_nr: 1,
        fall_id: 'fall-m1',
        fall_datum: '2026-07-01',
        kennzeichen: 'B-XY-42',
        schadenhoehe_netto: 4000,
        lead_preis_netto: 300,
        lead_preis_typ: 'paket',
        guthaben_verrechnet_netto: 0,
        sv_nachzahlung_netto: 300,
      },
    ]
    const claimIds = ['claim-abc', 'claim-def']
    const kontext = makeIndividualKontext(positionen, { claim_ids: claimIds })
    const inserts: Record<string, unknown[]> = {}
    const updatedRows: { table: string; ids: string[] }[] = []
    const db = fakeDb(inserts, undefined, updatedRows)
    const result = await createAbrechnung(db, SV_MONAT_DESCRIPTOR, { positionen, kontext })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.erstellt) throw new Error('unexpected result')
    expect(result.markiertOk).toBe(true)
    // Verify claims.update was called with the correct ids
    const claimsUpdate = updatedRows.find(r => r.table === 'claims')
    expect(claimsUpdate).toBeDefined()
    expect(claimsUpdate?.ids).toEqual(claimIds)
  })

  it('org Sammelrechnung: uses org empfaenger_id with sub_sv fields in JSONB positionen', async () => {
    const positionen = [
      {
        betrag_netto_cent: eurToCent(250),
        position_nr: 1,
        fall_id: 'fall-org-1',
        fall_datum: '2026-07-10',
        kennzeichen: 'X-12-ABC',
        schadenhoehe_netto: 6000,
        lead_preis_netto: 250,
        lead_preis_typ: 'paket',
        guthaben_verrechnet_netto: 0,
        sv_nachzahlung_netto: 250,
        sub_sv_id: 'sv-sub-1',
        sub_sv_name: 'Karl Gutachter',
      },
      {
        betrag_netto_cent: eurToCent(300),
        position_nr: 2,
        fall_id: 'fall-org-2',
        fall_datum: '2026-07-15',
        kennzeichen: 'Y-34-EFG',
        schadenhoehe_netto: 7000,
        lead_preis_netto: 300,
        lead_preis_typ: 'paket',
        guthaben_verrechnet_netto: 0,
        sv_nachzahlung_netto: 300,
        sub_sv_id: 'sv-sub-2',
        sub_sv_name: 'Maria Gutachterin',
      },
    ]
    const kontext = makeOrgKontext(positionen, { jahr: 2026, monatPad: '07' })
    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const result = await createAbrechnung(db, SV_MONAT_DESCRIPTOR, { positionen, kontext })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.erstellt) throw new Error('unexpected result')

    // Header insert present with org empfaenger_id
    const headerRow = inserts['abrechnungen']?.[0] as Record<string, unknown>
    expect(headerRow.empfaenger_id).toBe('org-id-1')
    expect(headerRow.empfaenger_email).toBe('verwalter@buero.de')

    // JSONB positionen include sub_sv_id
    const jsonbPos = headerRow.positionen as Array<Record<string, unknown>>
    expect(jsonbPos).toHaveLength(2)
    expect(jsonbPos[0].sub_sv_id).toBe('sv-sub-1')
    expect(jsonbPos[1].sub_sv_id).toBe('sv-sub-2')

    // Positionen audit-trail rows
    expect(inserts['abrechnung_positionen']).toHaveLength(2)

    // Netto sum: 250 + 300 = 550 EUR
    expect(centToEur(result.betraege.nettoCent)).toBe(550)
  })

  it('buildHeaderRow embeds correct JSONB positionen and monetary fields', () => {
    const betraege = {
      nettoCent: eurToCent(400),
      ustCent: calculateUst(eurToCent(400), 19).ust_cent,
      bruttoCent: calculateUst(eurToCent(400), 19).brutto_cent,
      ustSatz: 19,
      nummer: 'CMNDO-2026-07-0001',
    }
    const positionen = [
      {
        betrag_netto_cent: eurToCent(200),
        position_nr: 1,
        fall_id: 'f1',
        fall_datum: '2026-07-01',
        kennzeichen: 'M-T-1',
        schadenhoehe_netto: 3000,
        lead_preis_netto: 200,
        lead_preis_typ: 'paket',
        guthaben_verrechnet_netto: 0,
        sv_nachzahlung_netto: 200,
      },
      {
        betrag_netto_cent: eurToCent(200),
        position_nr: 2,
        fall_id: 'f2',
        fall_datum: '2026-07-10',
        kennzeichen: null,
        schadenhoehe_netto: 4000,
        lead_preis_netto: 200,
        lead_preis_typ: 'paket',
        guthaben_verrechnet_netto: 0,
        sv_nachzahlung_netto: 200,
      },
    ]
    const kontext = makeIndividualKontext(positionen, { jahr: 2026, monatPad: '07' })

    const row = SV_MONAT_DESCRIPTOR.buildHeaderRow!(betraege, positionen, kontext)

    expect(row).toMatchObject({
      empfaenger_typ: 'sv',
      empfaenger_id: 'sv-db-id',
      empfaenger_email: 'sv@example.com',
      empfaenger_name: 'Max Mustermann',
      abrechnungs_nr: 'CMNDO-2026-07-0001',
      summe_netto: 400,
      ust_satz: 19.0,
      ust_betrag: centToEur(calculateUst(eurToCent(400), 19).ust_cent),
      summe_brutto: centToEur(calculateUst(eurToCent(400), 19).brutto_cent),
      status: 'versendet',
    })
    expect(Array.isArray(row.positionen)).toBe(true)
    expect((row.positionen as unknown[]).length).toBe(2)
  })

  it('buildPositionRow maps abrechnung_positionen columns correctly', () => {
    const position = {
      betrag_netto_cent: eurToCent(200),
      position_nr: 3,
      fall_id: 'fall-pos-test',
      fall_datum: '2026-07-20',
      kennzeichen: 'K-12-XY',
      schadenhoehe_netto: 5500,
      lead_preis_netto: 200,
      lead_preis_typ: 'einzel',
      guthaben_verrechnet_netto: 50,
      sv_nachzahlung_netto: 200,
    }

    const row = SV_MONAT_DESCRIPTOR.buildPositionRow!(position, 'HDR-42', {})

    expect(row).toMatchObject({
      abrechnung_id: 'HDR-42',
      fall_id: 'fall-pos-test',
      fall_datum: '2026-07-20',
      kennzeichen: 'K-12-XY',
      schadenhoehe_netto: 5500,
      lead_preis_netto: 200,
      lead_preis_typ: 'einzel',
      guthaben_verrechnet_netto: 50,
      sv_nachzahlung_netto: 200,
      position_nr: 3,
    })
  })
})
