import { describe, it, expect, vi, beforeEach } from 'vitest'

// requireAdmin ist LOKAL in der Action und nutzt createClient (server) -> admin-User + rolle=admin.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { rolle: 'admin' } }) }) }),
    }),
  }),
}))

const eqCalls: Array<[string, string]> = []
let mockRow: Record<string, unknown> = { pdf_storage_path: 'partner-gutschriften/2026/x.pdf' }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      Object.assign(chain, {
        select: () => chain,
        eq: (c: string, v: string) => {
          eqCalls.push([c, v])
          return chain
        },
        neq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: mockRow, error: null }),
      })
      return chain
    },
    storage: {
      from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed' }, error: null }) }),
    },
  }),
}))

// Import-Kette der Action neutralisieren (provision-status + partner-gutschrift-korrektur ziehen
// sonst @react-pdf via partner-gutschrift-pdf).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/finance/provision-status', () => ({
  freigebenProvision: vi.fn(),
  storniereProvision: vi.fn(),
  auszahlenProvision: vi.fn(),
  resolveLedgerKontext: vi.fn(async () => ({
    ok: true,
    ctx: { nettoEur: 100, partnerId: 'p1', partnerTyp: 'makler', istKleinunternehmer: false, leistungsDatum: null, leistungText: 'x' },
  })),
  PROVISION_TABELLEN: ['partner_provisionen', 'partner_staffel_bonus', 'provisionen_maik'],
}))
vi.mock('@/lib/finance/partner-gutschrift-korrektur', () => ({
  korrigierePartnerGutschrift: vi.fn(async () => ({ ok: true, stornoNummer: 'S', korrekturNummer: 'K' })),
  computeKorrekturBetraege: vi.fn(() => ({
    ok: true,
    betraege: { nettoCent: 10000, ustSatz: 19, ustBetragCent: 1900, bruttoCent: 11900 },
  })),
}))
vi.mock('@/app/admin/abrechnungen/actions', () => ({
  markBezahlt: vi.fn(),
  retryEinzug: vi.fn(),
  stornoAbrechnung: vi.fn(),
}))

import {
  getPartnerGutschriftDownloadUrl,
  korrigierePartnerGutschriftAction,
  getKorrekturVorschauAction,
} from './partner-billing-actions'
import { korrigierePartnerGutschrift } from './partner-gutschrift-korrektur'

beforeEach(() => {
  eqCalls.length = 0
  mockRow = { pdf_storage_path: 'partner-gutschriften/2026/x.pdf' }
  vi.mocked(korrigierePartnerGutschrift).mockClear()
})

describe('getPartnerGutschriftDownloadUrl', () => {
  it('default typ = gutschrift (Fallback ledger+typ)', async () => {
    const r = await getPartnerGutschriftDownloadUrl('partner_provisionen', 'led-1')
    expect(r).toEqual({ ok: true, url: 'https://signed' })
    expect(eqCalls).toContainEqual(['typ', 'gutschrift'])
  })

  it('typ = storno filtert typ=storno', async () => {
    await getPartnerGutschriftDownloadUrl('partner_provisionen', 'led-1', 'storno')
    expect(eqCalls).toContainEqual(['typ', 'storno'])
  })

  it('gutschriftId -> praeziser Download per id (kein typ-Filter)', async () => {
    await getPartnerGutschriftDownloadUrl('partner_provisionen', 'led-1', 'gutschrift', 'g-99')
    expect(eqCalls).toContainEqual(['id', 'g-99'])
    expect(eqCalls.find(([c]) => c === 'typ')).toBeUndefined()
  })
})

describe('korrigierePartnerGutschriftAction', () => {
  it('ungueltige Quelle -> {ok:false}, kein Korrektur-Call', async () => {
    const r = await korrigierePartnerGutschriftAction('nicht_gueltig', 'led-1', 'Grund')
    expect(r.ok).toBe(false)
    expect(korrigierePartnerGutschrift).not.toHaveBeenCalled()
  })

  it('leerer Grund -> {ok:false}', async () => {
    const r = await korrigierePartnerGutschriftAction('partner_provisionen', 'led-1', '   ')
    expect(r.ok).toBe(false)
    expect(korrigierePartnerGutschrift).not.toHaveBeenCalled()
  })

  it('valide -> delegiert an korrigierePartnerGutschrift', async () => {
    const r = await korrigierePartnerGutschriftAction('partner_provisionen', 'led-1', 'USt-Korrektur', { ustSatz: 7 })
    expect(r).toEqual({ ok: true, stornoNummer: 'S', korrekturNummer: 'K' })
    expect(korrigierePartnerGutschrift).toHaveBeenCalledWith(
      expect.anything(),
      'partner_provisionen',
      'led-1',
      'USt-Korrektur',
      { ustSatz: 7 },
    )
  })
})

describe('getKorrekturVorschauAction', () => {
  it('ungueltige Quelle -> {ok:false}', async () => {
    const r = await getKorrekturVorschauAction('nicht_gueltig', 'led-1')
    expect(r.ok).toBe(false)
  })

  it('liefert original (Cent) + recompute', async () => {
    mockRow = { gutschrift_nr: 'CMNDO-GS-2026-00001', betrag_netto: 100, ust_satz: 19, ust_betrag: 19, betrag_brutto: 119 }
    const r = await getKorrekturVorschauAction('partner_provisionen', 'led-1')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.original).toEqual({ nettoCent: 10000, ustSatz: 19, ustBetragCent: 1900, bruttoCent: 11900, nr: 'CMNDO-GS-2026-00001' })
      expect(r.recompute.nettoCent).toBe(10000)
    }
  })
})
