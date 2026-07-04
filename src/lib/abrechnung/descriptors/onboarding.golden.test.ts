import { describe, it, expect, vi } from 'vitest'
import { calculateUst, eurToCent } from '@/lib/billing/calculate-ust'
import { ONBOARDING_DESCRIPTOR } from './onboarding'
import { createAbrechnung } from '@/lib/abrechnung/create-abrechnung'

vi.mock('@/lib/billing/generate-rechnungs-nr', () => ({
  nextRechnungsNrRaw: vi.fn().mockResolvedValue(42),
}))

function fakeDb(inserts: Record<string, unknown[]>) {
  return {
    from: (t: string) => ({
      insert: (row: unknown) => {
        inserts[t] = inserts[t] ?? []
        if (Array.isArray(row)) inserts[t].push(...row); else inserts[t].push(row)
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'ONB-1' }, error: null }) }) }
      },
    }),
  } as any
}

describe('ONBOARDING_DESCRIPTOR golden test', () => {
  const NETTO_EURO = 3000
  const netto_cent = eurToCent(NETTO_EURO)   // 300000
  const oldFormula = calculateUst(netto_cent, 19)

  it('cent amounts are byte-identical to old inline formula (no drift)', async () => {
    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const bezahlt_am = new Date('2026-07-04T10:00:00Z')
    const kontext: Record<string, unknown> = {
      jahr: bezahlt_am.getFullYear(),
      sv_id: 'sv-test-id',
      organisation_id: null,
      rechnungs_datum: bezahlt_am.toISOString().slice(0, 10),
      leistungs_datum: bezahlt_am.toISOString().slice(0, 10),
      paket: 'pro',
      stripe_payment_intent_id: 'pi_test',
      stripe_session_id: 'cs_test',
      pdf_storage_path: null,
      typ: 'solo',
      rechnungssteller: 'Claimondo GmbH',
      rechnungs_konfiguration_id: 'konfig-1',
      konfig_version: 1,
    }

    const result = await createAbrechnung(db, ONBOARDING_DESCRIPTOR, {
      positionen: [{ betrag_netto_cent: netto_cent }],
      kontext,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    if (!result.erstellt) throw new Error('should be erstellt:true')

    // Golden: byte-identical to old inline formula
    expect(result.betraege.nettoCent).toBe(oldFormula.netto_cent)         // 300000
    expect(result.betraege.ustCent).toBe(oldFormula.ust_cent)             // 57000
    expect(result.betraege.bruttoCent).toBe(oldFormula.brutto_cent)       // 357000
    expect(result.betraege.ustSatz).toBe(oldFormula.ust_satz_pct)         // 19

    // Explicit values for documentation
    expect(result.betraege.nettoCent).toBe(300000)
    expect(result.betraege.ustCent).toBe(57000)
    expect(result.betraege.bruttoCent).toBe(357000)
  })

  it('nummer format matches CM-ONB-{YYYY}-{NNNNN} from old generateRechnungsNr', async () => {
    const inserts: Record<string, unknown[]> = {}
    const db = fakeDb(inserts)
    const kontext: Record<string, unknown> = {
      jahr: 2026,
      sv_id: null,
      organisation_id: 'org-1',
      rechnungs_datum: '2026-07-04',
      leistungs_datum: '2026-07-04',
      paket: null,
      stripe_payment_intent_id: null,
      stripe_session_id: null,
      pdf_storage_path: null,
      typ: 'buero',
      rechnungssteller: 'Claimondo GmbH',
      rechnungs_konfiguration_id: 'konfig-1',
      konfig_version: 1,
    }

    const result = await createAbrechnung(db, ONBOARDING_DESCRIPTOR, {
      positionen: [{ betrag_netto_cent: 50000 }],
      kontext,
    })

    if (!result.ok || !result.erstellt) throw new Error('unexpected result')
    // nextRechnungsNrRaw mocked to 42 -> CM-ONB-2026-00042
    expect(result.nummer).toBe('CM-ONB-2026-00042')
  })

  it('buildHeaderRow maps all columns from kontext correctly', () => {
    const betraege = {
      nettoCent: 300000,
      ustCent: 57000,
      bruttoCent: 357000,
      ustSatz: 19,
      nummer: 'CM-ONB-2026-00001',
    }
    const kontext: Record<string, unknown> = {
      sv_id: 'sv-abc',
      organisation_id: null,
      rechnungs_datum: '2026-07-04',
      leistungs_datum: '2026-07-04',
      paket: 'starter',
      stripe_payment_intent_id: 'pi_xyz',
      stripe_session_id: 'cs_xyz',
      pdf_storage_path: 'onboarding-rechnungen/abc.pdf',
      typ: 'solo',
      rechnungssteller: 'Claimondo GmbH',
      rechnungs_konfiguration_id: 'konfig-abc',
      konfig_version: 3,
    }

    const row = ONBOARDING_DESCRIPTOR.buildHeaderRow(betraege, [], kontext)

    expect(row).toMatchObject({
      sv_id: 'sv-abc',
      organisation_id: null,
      rechnungs_nr: 'CM-ONB-2026-00001',
      rechnungs_datum: '2026-07-04',
      leistungs_datum: '2026-07-04',
      paket: 'starter',
      netto_cent: 300000,
      ust_cent: 57000,
      brutto_cent: 357000,
      ust_satz_pct: 19,
      stripe_payment_intent_id: 'pi_xyz',
      stripe_session_id: 'cs_xyz',
      pdf_storage_path: 'onboarding-rechnungen/abc.pdf',
      typ: 'solo',
      rechnungssteller: 'Claimondo GmbH',
      rechnungs_konfiguration_id: 'konfig-abc',
      konfig_version: 3,
    })
  })
})
