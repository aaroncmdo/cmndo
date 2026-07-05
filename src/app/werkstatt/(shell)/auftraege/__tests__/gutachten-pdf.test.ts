// SP3 Task 2 — Tests fuer oeffneGutachtenPdf.
// Sicherheits-Kern: Access via v_werkstatt_auftrag (RLS-Gate) MUSS zuerst laufen;
// erst danach Service-Client-Read des bericht_pdf_url + signed-URL-Generierung.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted Holders ────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  // Ergebnis der v_werkstatt_auftrag-Abfrage (Access-Gate)
  auftragResult: { data: { claim_id: 'c1' } as Record<string, unknown> | null, error: null as { message: string } | null },
  // Ergebnis der gutachten-Abfrage (Service-Client)
  gutachtenResult: { data: { bericht_pdf_url: 'gutachten/c1/bericht.pdf' } as Record<string, unknown> | null, error: null as { message: string } | null },
  // Signed-URL-Result
  signedUrl: 'https://storage.example.com/signed-url?token=xyz',
  getStorageUrlMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/portal-guard', () => ({
  requirePortalAccess: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/werkstatt/notify-kunde-reparaturtermin', () => ({
  notifyKundeReparaturtermin: vi.fn().mockResolvedValue({ email: true, inApp: true }),
}))
// P2-Actions (resendeKundenLink/oeffneKundenFlow) ziehen diese server-only-Module ins
// actions.ts. oeffneGutachtenPdf ruft sie nie — die Stubs verhindern nur den
//'server-only'-Import (via start-link/ensure-flowlink-for-lead) im Test-Import-Graph.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/start-link/ensure-flowlink-for-lead', () => ({
  ensureCanonicalFlowLinkForLead: vi.fn(),
}))
vi.mock('@/lib/start-link/send-flowlink-multichannel', () => ({
  sendFlowLinkMultiChannelCore: vi.fn(),
}))
vi.mock('@/lib/storage/url', () => ({
  getStorageUrl: h.getStorageUrlMock,
  STORAGE_TTL: { ui: 3600, download: 300, email: 604800 },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: vi.fn((table: string) => {
      if (table === 'v_werkstatt_auftrag') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockImplementation(async () => h.auftragResult),
            })),
          })),
        }
      }
      // reparatur_termine (SP2 Actions)
      return {
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        })),
      }
    }),
  })),
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'gutachten') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockImplementation(async () => h.gutachtenResult),
                  })),
                })),
              })),
            })),
          })),
        }
      }
      return {}
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: h.signedUrl }, error: null }),
      })),
    },
  })),
}))

beforeEach(() => {
  h.auftragResult = { data: { claim_id: 'c1' }, error: null }
  h.gutachtenResult = { data: { bericht_pdf_url: 'gutachten/c1/bericht.pdf' }, error: null }
  h.signedUrl = 'https://storage.example.com/signed-url?token=xyz'
  h.getStorageUrlMock.mockReset()
  h.getStorageUrlMock.mockResolvedValue(h.signedUrl)
})

describe('oeffneGutachtenPdf', () => {
  it('kein claimId -> ok:false', async () => {
    const { oeffneGutachtenPdf } = await import('../actions')
    const r = await oeffneGutachtenPdf('')
    expect(r.ok).toBe(false)
  })

  it('kein Auftrag / kein Access (v-Query leer) -> ok:false', async () => {
    h.auftragResult = { data: null, error: null }
    const { oeffneGutachtenPdf } = await import('../actions')
    const r = await oeffneGutachtenPdf('c-fremd')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Zugriff/)
  })

  it('Auftrag vorhanden, aber kein bericht_pdf_url -> ok:false', async () => {
    h.gutachtenResult = { data: null, error: null }
    const { oeffneGutachtenPdf } = await import('../actions')
    const r = await oeffneGutachtenPdf('c1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Gutachten/)
  })

  it('Erfolg -> ok:true, url = signed URL', async () => {
    const { oeffneGutachtenPdf } = await import('../actions')
    const r = await oeffneGutachtenPdf('c1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url).toBe(h.signedUrl)
  })

  it('bericht_pdf_url ist bereits volle URL -> direkt zurueckgeben ohne getStorageUrl', async () => {
    const fullUrl = 'https://supabase.co/storage/v1/object/public/gutachten/c1/bericht.pdf'
    h.gutachtenResult = { data: { bericht_pdf_url: fullUrl }, error: null }
    const { oeffneGutachtenPdf } = await import('../actions')
    const r = await oeffneGutachtenPdf('c1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url).toBe(fullUrl)
    // getStorageUrl sollte NICHT aufgerufen worden sein
    expect(h.getStorageUrlMock).not.toHaveBeenCalled()
  })

  it('getStorageUrl gibt null zurueck (Storage-Fehler) -> ok:false', async () => {
    h.getStorageUrlMock.mockResolvedValue(null)
    const { oeffneGutachtenPdf } = await import('../actions')
    const r = await oeffneGutachtenPdf('c1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/URL/)
  })
})
