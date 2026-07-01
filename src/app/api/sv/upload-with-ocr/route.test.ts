import { describe, it, expect, vi } from 'vitest'

// Write-Path-Audit 2026-07-01, F4: terminId ist SV-owned verifiziert, fallId war ein
// unabhaengiges Formfeld. Ein SV darf kein Dokument auf einen fremden Claim pflanzen —
// der verifizierte Termin muss zum uebergebenen fallId gehoeren, sonst 403.

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'sv-user-1' } } }) },
  }),
}))
vi.mock('@/lib/gutachter', () => ({
  getGutachterForUser: async () => ({ id: 'sv-1' }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    // Der SV-owned Termin gehoert zu FALL_A.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      single: async () => ({ data: { id: 'termin-1', fall_id: 'FALL_A' } }),
    }
    return { from: () => chain }
  },
}))
// Import-Zeit-Nebenwirkungen der OCR-Module vermeiden (Pfad wird im 403-Fall nie erreicht).
vi.mock('@/lib/ocr/extract', () => ({ extractText: vi.fn(), extractFromKfzSchein: vi.fn(), extractFin: vi.fn() }))
vi.mock('@/lib/ocr/validation', () => ({ validateFinMatch: vi.fn(), validateKennzeichenMatch: vi.fn() }))
vi.mock('@/lib/storage/url', () => ({ getStorageUrl: vi.fn() }))

import { POST } from './route'

function makeReq(fields: Record<string, unknown>) {
  const fd = new FormData()
  for (const k in fields) fd.set(k, fields[k] as string | Blob)
  return { formData: async () => fd } as unknown as import('next/server').NextRequest
}

describe('POST /api/sv/upload-with-ocr — F4 fallId-Bindung', () => {
  it('403 wenn fallId nicht zum SV-verifizierten Termin gehoert', async () => {
    const req = makeReq({
      file: new File(['x'], 'x.jpg', { type: 'image/jpeg' }),
      terminId: 'termin-1',
      fallId: 'FALL_B', // != termin.fall_id 'FALL_A'
      dokumentTyp: 'fahrzeugschein',
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})
