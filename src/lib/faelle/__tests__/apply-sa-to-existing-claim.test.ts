import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/faelle/resume-funnel-after-onboarding', () => ({
  resumeFunnelAfterOnboarding: vi.fn(async () => undefined),
}))

import { applySAToExistingClaim } from '../apply-sa-to-existing-claim'
import { resumeFunnelAfterOnboarding } from '@/lib/faelle/resume-funnel-after-onboarding'

type Update = { table: string; payload: Record<string, unknown>; id: unknown }
const updates: Update[] = []
let updateError: { message: string } | null = null

function fakeAdmin() {
  return {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (_col: string, id: unknown) => {
          updates.push({ table, payload, id })
          return Promise.resolve({ error: updateError })
        },
      }),
    }),
  } as never
}

beforeEach(() => {
  updates.length = 0
  updateError = null
  vi.mocked(resumeFunnelAfterOnboarding).mockClear().mockResolvedValue(undefined)
})

describe('applySAToExistingClaim (P4 sign-into-existing)', () => {
  it('UPDATED den Claim (sa+onboarding+abtretung_pdf, KEIN operative_status) + resume-Hook 1x', async () => {
    const r = await applySAToExistingClaim(fakeAdmin(), {
      claimId: 'c1',
      fallId: 'f1',
      signatureUrl: 'https://storage/sig.png',
    })
    expect(r).toEqual({ ok: true })
    expect(updates).toHaveLength(1)
    const u = updates[0]
    expect(u.table).toBe('claims')
    expect(u.id).toBe('c1')
    expect(u.payload.sa_unterschrieben).toBe(true)
    expect(u.payload.onboarding_complete).toBe(true)
    expect(u.payload.abtretung_pdf).toBe('https://storage/sig.png')
    expect(u.payload.sa_unterschrieben_am).toBeTruthy()
    expect(u.payload.abtretung_signiert_am).toBeTruthy()
    expect(u.payload.operative_status).toBeUndefined() // Engine/AutoPhase advanced, nie hier
    expect(resumeFunnelAfterOnboarding).toHaveBeenCalledExactlyOnceWith('f1')
  })

  it('Update-Fehler -> { ok:false }, KEIN resume-Hook', async () => {
    updateError = { message: 'row locked' }
    const r = await applySAToExistingClaim(fakeAdmin(), {
      claimId: 'c1',
      fallId: 'f1',
      signatureUrl: 'https://storage/sig.png',
    })
    expect(r).toEqual({ ok: false, error: 'row locked' })
    expect(resumeFunnelAfterOnboarding).not.toHaveBeenCalled()
  })

  it('resume-Hook wirft -> ok bleibt true (non-fatal)', async () => {
    vi.mocked(resumeFunnelAfterOnboarding).mockRejectedValueOnce(new Error('boom'))
    const r = await applySAToExistingClaim(fakeAdmin(), {
      claimId: 'c1',
      fallId: 'f1',
      signatureUrl: 'https://storage/sig.png',
    })
    expect(r).toEqual({ ok: true })
  })
})
