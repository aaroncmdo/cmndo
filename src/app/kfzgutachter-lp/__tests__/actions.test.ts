import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks müssen vor dem dynamischen Import des Moduls aufgebaut werden.
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map<string, string>([
    ['x-forwarded-for', '203.0.113.45'],
    ['user-agent', 'Mozilla/5.0 (Test)'],
    ['referer', 'https://kfzgutachter.claimondo.de/?utm_source=test'],
  ])),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Service-Client-Mock-Factory
const mockInsertSingle = vi.fn()
const mockRpc = vi.fn()
const mockFrom = vi.fn().mockReturnValue({
  insert: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: () => mockInsertSingle(),
    }),
  }),
})
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: mockFrom, rpc: mockRpc }),
}))

import { submitKfzgutachterLead } from '../actions'

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('name', overrides.name ?? 'Max Mustermann')
  fd.set('phone', overrides.phone ?? '015100000000')
  fd.set('city', overrides.city ?? 'Köln')
  if (overrides.utm_source) fd.set('utm_source', overrides.utm_source)
  return fd
}

describe('submitKfzgutachterLead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Validation-Fehler: gibt field=phone bei ungültigem Telefon', async () => {
    const fd = buildFormData({ phone: 'abc' })
    const result = await submitKfzgutachterLead(fd)
    expect(result).toEqual({
      ok: false,
      error: 'Ungültige Telefonnummer',
      field: 'phone',
    })
    expect(mockInsertSingle).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('Happy-Path: schreibt Anfrage + ruft Convert + gibt leadId/anfrageId', async () => {
    mockInsertSingle.mockResolvedValue({ data: { id: 'anfrage-uuid' }, error: null })
    mockRpc.mockResolvedValue({ data: 'lead-uuid', error: null })

    const fd = buildFormData()
    const result = await submitKfzgutachterLead(fd)

    expect(result).toEqual({
      ok: true,
      leadId: 'lead-uuid',
      anfrageId: 'anfrage-uuid',
    })
    expect(mockFrom).toHaveBeenCalledWith('anfragen')
    expect(mockRpc).toHaveBeenCalledWith('convert_anfrage_zu_lead', {
      p_anfrage_id: 'anfrage-uuid',
    })
  })

  it('Anfrage-Insert-Failure: kein RPC, generischer Tel-Fallback-Error', async () => {
    mockInsertSingle.mockResolvedValue({ data: null, error: { message: 'DB unreachable' } })

    const fd = buildFormData()
    const result = await submitKfzgutachterLead(fd)

    expect(result).toEqual({
      ok: false,
      error: 'Konfigurationsfehler — bitte rufen Sie an: 0221 25906530',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('Convert-Failure: Anfrage existiert, Soft-Error mit anfrageId', async () => {
    mockInsertSingle.mockResolvedValue({ data: { id: 'anfrage-uuid' }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'lead-insert NOT NULL' } })

    const fd = buildFormData()
    const result = await submitKfzgutachterLead(fd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.anfrageId).toBe('anfrage-uuid')
      expect(result.error).toContain('Verarbeitung')
    }
  })
})
