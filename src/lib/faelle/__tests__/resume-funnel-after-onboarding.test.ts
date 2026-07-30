import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/autoPhase', () => ({ checkFallAutoPhase: vi.fn(async () => undefined) }))
vi.mock('@/lib/abrechnung/process-case-billing', () => ({ processCaseBilling: vi.fn(async () => null) }))

import { resumeFunnelAfterOnboarding } from '../resume-funnel-after-onboarding'
import { checkFallAutoPhase } from '@/lib/autoPhase'
import { processCaseBilling } from '@/lib/abrechnung/process-case-billing'

beforeEach(() => {
  vi.mocked(checkFallAutoPhase).mockClear().mockResolvedValue(undefined as never)
  vi.mocked(processCaseBilling).mockClear().mockResolvedValue(null)
})

describe('resumeFunnelAfterOnboarding (P4)', () => {
  it('ruft processCaseBilling + checkFallAutoPhase je genau 1x mit der fallId', async () => {
    await resumeFunnelAfterOnboarding('fall-1')
    expect(processCaseBilling).toHaveBeenCalledExactlyOnceWith('fall-1')
    expect(checkFallAutoPhase).toHaveBeenCalledExactlyOnceWith('fall-1')
  })

  it('Billing wirft -> AutoPhase laeuft trotzdem, kein Re-throw (non-fatal)', async () => {
    vi.mocked(processCaseBilling).mockRejectedValueOnce(new Error('billing down'))
    await expect(resumeFunnelAfterOnboarding('fall-1')).resolves.toBeUndefined()
    expect(checkFallAutoPhase).toHaveBeenCalledTimes(1)
  })

  it('AutoPhase wirft -> kein Re-throw (non-fatal)', async () => {
    vi.mocked(checkFallAutoPhase).mockRejectedValueOnce(new Error('autophase down'))
    await expect(resumeFunnelAfterOnboarding('fall-1')).resolves.toBeUndefined()
  })
})
