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
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const chain: any = {
          eq: (c: string, v: string) => {
            eqCalls.push([c, v])
            return chain
          },
          maybeSingle: async () => ({ data: { pdf_storage_path: 'partner-gutschriften/2026/x.pdf' } }),
        }
        return chain
      },
    }),
    storage: {
      from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed' }, error: null }) }),
    },
  }),
}))

// Import-Kette der Action neutralisieren (provision-status zieht sonst @react-pdf via partner-gutschrift-pdf).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/finance/provision-status', () => ({
  freigebenProvision: vi.fn(),
  storniereProvision: vi.fn(),
  auszahlenProvision: vi.fn(),
  PROVISION_TABELLEN: [],
}))
vi.mock('@/app/admin/abrechnungen/actions', () => ({
  markBezahlt: vi.fn(),
  retryEinzug: vi.fn(),
  stornoAbrechnung: vi.fn(),
}))

import { getPartnerGutschriftDownloadUrl } from './partner-billing-actions'

beforeEach(() => {
  eqCalls.length = 0
})

describe('getPartnerGutschriftDownloadUrl typ-Weiche', () => {
  it('default typ = gutschrift', async () => {
    const r = await getPartnerGutschriftDownloadUrl('makler_provisionen', 'led-1')
    expect(r).toEqual({ ok: true, url: 'https://signed' })
    expect(eqCalls).toContainEqual(['typ', 'gutschrift'])
  })

  it('typ = storno filtert typ=storno', async () => {
    await getPartnerGutschriftDownloadUrl('makler_provisionen', 'led-1', 'storno')
    expect(eqCalls).toContainEqual(['typ', 'storno'])
  })
})
