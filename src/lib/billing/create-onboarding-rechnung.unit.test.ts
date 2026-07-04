import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- module mocks ---
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('./get-rechnungs-konfig', () => ({
  getAktuelleRechnungsKonfig: vi.fn(),
}))
vi.mock('@/lib/pdf/onboarding-rechnung', () => ({
  generateAndUploadOnboardingRechnungPdf: vi.fn(),
}))
vi.mock('@/lib/abrechnung/create-abrechnung', () => ({
  createAbrechnung: vi.fn(),
}))
vi.mock('@/lib/abrechnung/descriptors/onboarding', () => ({
  ONBOARDING_DESCRIPTOR: {},
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getAktuelleRechnungsKonfig } from './get-rechnungs-konfig'
import { generateAndUploadOnboardingRechnungPdf } from '@/lib/pdf/onboarding-rechnung'
import { createAbrechnung } from '@/lib/abrechnung/create-abrechnung'
import { createOnboardingRechnung } from './create-onboarding-rechnung'

const mockGetAktuelleRechnungsKonfig = vi.mocked(getAktuelleRechnungsKonfig)
const mockGeneratePdf = vi.mocked(generateAndUploadOnboardingRechnungPdf)
const mockCreateAbrechnung = vi.mocked(createAbrechnung)
const mockCreateAdminClient = vi.mocked(createAdminClient)

function makeKonfig() {
  return {
    id: 'konfig-1',
    version: 1,
    rechnungssteller: 'Claimondo GmbH',
    ust_satz_pct: 19,
  } as any
}

function makeSvDb(ops: { deletedId?: string; updatedId?: string }) {
  return {
    from: (t: string) => ({
      select: (cols: string) => ({
        eq: (_col: string, _val: string) => ({
          single: () =>
            t === 'sachverstaendige'
              ? Promise.resolve({
                  data: {
                    firmenname: 'Test SV GmbH',
                    profile_id: 'p-1',
                    standort_adresse: 'Teststr. 1',
                    standort_plz: '10115',
                    steuernummer: null,
                    ust_id: null,
                  },
                  error: null,
                })
              : Promise.resolve({ data: { vorname: 'Max', nachname: 'Muster' }, error: null }),
        }),
      }),
      update: (_payload: unknown) => ({
        eq: (_col: string, id: string) => {
          ops.updatedId = id
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({
        eq: (_col: string, id: string) => {
          ops.deletedId = id
          return Promise.resolve({ error: null })
        },
      }),
    }),
  } as any
}

describe('createOnboardingRechnung — compensating-delete on PDF failure (I-1)', () => {
  const baseCtx = {
    typ: 'solo' as const,
    sv_id: 'sv-1',
    organisation_id: null,
    stripe_session_id: 'cs_test',
    stripe_payment_intent_id: 'pi_test',
    netto_euro: 3000,
    paket: 'pro',
    kontingent: 10,
    bezahlt_am: new Date('2026-07-04T10:00:00Z'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the inserted row and returns { success: false } when PDF generation throws', async () => {
    const ops: { deletedId?: string; updatedId?: string } = {}
    mockCreateAdminClient.mockReturnValue(makeSvDb(ops) as any)
    mockGetAktuelleRechnungsKonfig.mockResolvedValue(makeKonfig())
    mockCreateAbrechnung.mockResolvedValue({
      ok: true,
      erstellt: true,
      id: 'onb-row-1',
      nummer: 'CM-ONB-2026-00001',
      betraege: {
        nettoCent: 300000,
        ustCent: 57000,
        bruttoCent: 357000,
        ustSatz: 19,
        nummer: 'CM-ONB-2026-00001',
      },
      markiertOk: true,
    })
    mockGeneratePdf.mockRejectedValue(new Error('S3 upload timeout'))

    const result = await createOnboardingRechnung(baseCtx)

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toContain('PDF-Generierung fehlgeschlagen')
    expect(result.error).toContain('CM-ONB-2026-00001')
    expect(result.error).toContain('S3 upload timeout')
    // Compensating delete must have targeted the exact row id
    expect(ops.deletedId).toBe('onb-row-1')
    // update (pdf_storage_path patch) must NOT have been called
    expect(ops.updatedId).toBeUndefined()
  })

  it('does NOT delete when PDF succeeds (happy path returns success:true)', async () => {
    const ops: { deletedId?: string; updatedId?: string } = {}
    mockCreateAdminClient.mockReturnValue(makeSvDb(ops) as any)
    mockGetAktuelleRechnungsKonfig.mockResolvedValue(makeKonfig())
    mockCreateAbrechnung.mockResolvedValue({
      ok: true,
      erstellt: true,
      id: 'onb-row-2',
      nummer: 'CM-ONB-2026-00002',
      betraege: {
        nettoCent: 300000,
        ustCent: 57000,
        bruttoCent: 357000,
        ustSatz: 19,
        nummer: 'CM-ONB-2026-00002',
      },
      markiertOk: true,
    })
    const fakeBuffer = Buffer.from('pdf-bytes')
    mockGeneratePdf.mockResolvedValue({
      pdf_buffer: fakeBuffer,
      storage_path: 'onboarding-rechnungen/onb-row-2.pdf',
    } as any)

    const result = await createOnboardingRechnung(baseCtx)

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected success')
    expect(result.rechnung_id).toBe('onb-row-2')
    // Compensating delete must NOT have been called on success
    expect(ops.deletedId).toBeUndefined()
    // The pdf_storage_path patch update SHOULD have fired
    expect(ops.updatedId).toBe('onb-row-2')
  })

  it('returns { success: false } when createAbrechnung itself fails (no delete needed)', async () => {
    const ops: { deletedId?: string; updatedId?: string } = {}
    mockCreateAdminClient.mockReturnValue(makeSvDb(ops) as any)
    mockGetAktuelleRechnungsKonfig.mockResolvedValue(makeKonfig())
    mockCreateAbrechnung.mockResolvedValue({ ok: false, error: 'Nummer-Allokation fehlgeschlagen' })

    const result = await createOnboardingRechnung(baseCtx)

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toContain('Nummer-Allokation fehlgeschlagen')
    // No row was inserted — compensating delete must NOT have been called
    expect(ops.deletedId).toBeUndefined()
  })
})
