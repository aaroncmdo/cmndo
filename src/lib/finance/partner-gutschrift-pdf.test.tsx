import { describe, it, expect, vi } from 'vitest'

// Mock @react-pdf/renderer so that renderToBuffer returns a fake PDF-like buffer
vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: any) => children,
  Page: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  View: ({ children }: any) => children,
  StyleSheet: { create: (s: any) => s },
  renderToBuffer: vi.fn(async () => {
    // Return a buffer that starts with %PDF- (ASCII: 37 80 68 70 45)
    return Buffer.from('%PDF-1.4 fake pdf content')
  }),
}))

// Mock shared blocks so they don't need react-pdf internals
vi.mock('@/lib/pdf/shared/rechnungs-blocks', () => ({
  AbsenderHeaderBlock: () => null,
  FooterNoteBlock: () => null,
  NAVY: '#0D1B3E',
  ONDO: '#4573A2',
}))

// Mock admin client (upload fn - not called in tests)
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
      })),
    },
  })),
}))

import {
  buildGutschriftViewModel,
  generatePartnerGutschriftPdf,
  generateAndUploadPartnerGutschriftPdf,
} from './partner-gutschrift-pdf'
import type { PartnerGutschriftPdfInput } from './partner-gutschrift-pdf'

// ─── Shared fixture helpers ──────────────────────────────────────────────────

function makeKonfig() {
  return {
    id: 'k-1',
    firmenname: 'Claimondo GmbH i.G.R.',
    strasse: 'Musterstr. 1',
    plz: '10115',
    ort: 'Berlin',
    steuernummer: '27/123/12345',
    ust_id: 'DE123456789',
    hrb: null,
    geschaeftsfuehrer: null,
    zahlungsempfaenger_name: 'Claimondo GmbH',
    zahlungsempfaenger_iban: 'DE89370400440532013000',
    zahlungsempfaenger_bic: 'COBADEFFXXX',
    zahlungsempfaenger_bank: 'Commerzbank',
    zahlungsempfaenger_hinweis: null,
    gueltig_ab: '2026-01-01',
    gueltig_bis: null,
    rechnungssteller: 'claimondo_gmbh_igr' as const,
    version: 1,
  }
}

const REGELBESTEUERT_INPUT: PartnerGutschriftPdfInput = {
  gutschrift_nr: 'CMNDO-GS-2026-00042',
  erstellt_am: '2026-07-05T10:00:00.000Z',
  leistung_text: 'Provision Lead #123 — Maklerleistung',
  betrag_netto: 150,
  ust_satz: 19,
  ust_betrag: 28.5,
  betrag_brutto: 178.5,
  empfaenger_snapshot: {
    name: 'Regelbesteuert Makler GmbH',
    adresse_strasse: 'Bahnhofstr. 10',
    adresse_plz: '10243',
    adresse_ort: 'Berlin',
    ust_id: 'DE987654321',
    ist_kleinunternehmer: false,
  },
  aussteller_snapshot: makeKonfig(),
}

const KLEINUNTERNEHMER_INPUT: PartnerGutschriftPdfInput = {
  gutschrift_nr: 'CMNDO-GS-2026-00043',
  erstellt_am: '2026-07-05T10:00:00.000Z',
  leistung_text: 'Provision Lead #456 — Kleinunternehmer',
  betrag_netto: 100,
  ust_satz: null,
  ust_betrag: null,
  betrag_brutto: 100,
  empfaenger_snapshot: {
    name: 'Kleinunternehmer Makler',
    adresse_strasse: 'Lindenstr. 3',
    adresse_plz: '50667',
    adresse_ort: 'Köln',
    ust_id: null,
    ist_kleinunternehmer: true,
  },
  aussteller_snapshot: makeKonfig(),
}

// ─── buildGutschriftViewModel tests ─────────────────────────────────────────

describe('buildGutschriftViewModel', () => {
  describe('regelbesteuert branch (ist_kleinunternehmer: false)', () => {
    it('has USt label and betrag, NO kleinunternehmerHinweis', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)

      expect((vm.summe as any).ustLabel).toBe('USt. 19 %')
      expect((vm.summe as any).ustBetrag).toBe('28,50 €')
      expect((vm.summe as any).kleinunternehmerHinweis).toBeUndefined()
    })

    it('brutto formatted correctly', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)
      expect(vm.summe.brutto).toBe('178,50 €')
      expect(vm.summe.netto).toBe('150,00 €')
    })
  })

  describe('Kleinunternehmer branch (ist_kleinunternehmer: true)', () => {
    it('has kleinunternehmerHinweis containing §19, NO ustLabel', () => {
      const vm = buildGutschriftViewModel(KLEINUNTERNEHMER_INPUT)

      expect((vm.summe as any).kleinunternehmerHinweis).toContain('§19')
      expect((vm.summe as any).ustLabel).toBeUndefined()
      expect((vm.summe as any).ustBetrag).toBeUndefined()
    })

    it('brutto equals netto for kleinunternehmer', () => {
      const vm = buildGutschriftViewModel(KLEINUNTERNEHMER_INPUT)
      expect(vm.summe.netto).toBe('100,00 €')
      expect(vm.summe.brutto).toBe('100,00 €')
    })
  })

  describe('common fields', () => {
    it('titel is "Gutschrift"', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)
      expect(vm.titel).toBe('Gutschrift')
    })

    it('hinweisParagraph contains §14 Abs. 2', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)
      expect(vm.hinweisParagraph).toContain('§14 Abs. 2')
    })

    it('nummer matches input gutschrift_nr', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)
      expect(vm.nummer).toBe('CMNDO-GS-2026-00042')
    })

    it('datum formats ISO date to de-DE dd.MM.yyyy', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)
      expect(vm.datum).toBe('05.07.2026')
    })

    it('position.text matches leistung_text', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)
      expect(vm.position.text).toBe('Provision Lead #123 — Maklerleistung')
    })

    it('position.netto formatted via formatEur', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)
      expect(vm.position.netto).toBe('150,00 €')
    })

    it('formatEur: 150 → "150,00 €"', () => {
      const vm = buildGutschriftViewModel({ ...REGELBESTEUERT_INPUT, betrag_netto: 150 })
      expect(vm.summe.netto).toBe('150,00 €')
    })

    it('empfaenger lines include name, strasse, plz/ort', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)
      expect(vm.empfaenger).toContain('Regelbesteuert Makler GmbH')
      expect(vm.empfaenger).toContain('Bahnhofstr. 10')
      expect(vm.empfaenger).toContain('10243 Berlin')
    })

    it('empfaenger includes ust_id line when present', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)
      expect(vm.empfaenger).toContain('USt-IdNr.: DE987654321')
    })

    it('empfaenger omits ust_id line when null', () => {
      const vm = buildGutschriftViewModel(KLEINUNTERNEHMER_INPUT)
      expect(vm.empfaenger.join('\n')).not.toContain('USt-IdNr.')
    })

    it('auszahlungHinweis contains "Bankkonto"', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)
      expect(vm.auszahlungHinweis).toContain('Bankkonto')
    })

    it('istKleinunternehmer is false for regelbesteuert', () => {
      const vm = buildGutschriftViewModel(REGELBESTEUERT_INPUT)
      expect(vm.istKleinunternehmer).toBe(false)
    })

    it('istKleinunternehmer is true for kleinunternehmer', () => {
      const vm = buildGutschriftViewModel(KLEINUNTERNEHMER_INPUT)
      expect(vm.istKleinunternehmer).toBe(true)
    })
  })
})

// ─── generatePartnerGutschriftPdf smoke tests ────────────────────────────────

describe('generatePartnerGutschriftPdf', () => {
  it('regelbesteuert: returns Buffer starting with %PDF-', async () => {
    const buf = await generatePartnerGutschriftPdf(REGELBESTEUERT_INPUT)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-')
  })

  it('kleinunternehmer: returns Buffer starting with %PDF-', async () => {
    const buf = await generatePartnerGutschriftPdf(KLEINUNTERNEHMER_INPUT)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-')
  })
})

// ─── generateAndUploadPartnerGutschriftPdf bucket regression ─────────────────

describe('generateAndUploadPartnerGutschriftPdf — bucket name guard', () => {
  it('uploads to abrechnungen-pdf (not onboarding-rechnungen) and returns path under partner-gutschriften/', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const uploadSpy = vi.fn(async () => ({ error: null }))
    const fromSpy = vi.fn(() => ({ upload: uploadSpy }))
    ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      storage: { from: fromSpy },
    })

    const result = await generateAndUploadPartnerGutschriftPdf(REGELBESTEUERT_INPUT)

    expect(result.ok).toBe(true)
    // The correct existing bucket must be used
    expect(fromSpy).toHaveBeenCalledWith('abrechnungen-pdf')
    // Object path must stay namespaced under partner-gutschriften/
    if (result.ok) {
      expect(result.pdfPath).toMatch(/^partner-gutschriften\//)
    }
  })
})
