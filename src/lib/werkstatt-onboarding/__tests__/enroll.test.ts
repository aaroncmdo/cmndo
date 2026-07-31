import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enrolleWerkstatt } from '../enroll'

// mockt die zwei Supabase-Ketten: werkstatt_onboarding_steps (.select.eq.single, Step-1-Offset)
// + werkstatt_onboarding_enrollments (.upsert). Der upsert-Mock wird SEPARAT zurueckgegeben
// (typklar fuer .mock-Assertions) — db selbst ist fuer den enrolleWerkstatt-Param `as never`.
function mockDb(step1Offset: number | null = 0, upsertError: { message: string } | null = null) {
  const upsert = vi.fn().mockResolvedValue({ error: upsertError })
  const db = {
    from: (t: string) =>
      t === 'werkstatt_onboarding_steps'
        ? { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: step1Offset === null ? null : { offset_tage: step1Offset } }) }) }) }
        : { upsert },
  } as never
  return { db, upsert }
}

describe('enrolleWerkstatt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('idempotenter Upsert mit onConflict/ignoreDuplicates (Step 1 offset_tage=0)', async () => {
    const { db, upsert } = mockDb(0)
    const r = await enrolleWerkstatt(db, 'w1')
    expect(r.ok).toBe(true)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ werkstatt_id: 'w1', aktueller_step: 0, status: 'aktiv' }),
      expect.objectContaining({ onConflict: 'werkstatt_id', ignoreDuplicates: true }),
    )
  })

  it('next_send_at = jetzt + Step-1-offset_tage (Anker ist die Enroll-Zeit)', async () => {
    const { db, upsert } = mockDb(3)
    await enrolleWerkstatt(db, 'w2')
    const payload = upsert.mock.calls[0][0]
    expect(payload.next_send_at).toBe('2026-01-04T00:00:00.000Z')
  })

  it('fehlender Step 1 (keine Steps geseedet) faellt auf offset 0 zurueck statt zu werfen', async () => {
    const { db, upsert } = mockDb(null)
    const r = await enrolleWerkstatt(db, 'w3')
    expect(r.ok).toBe(true)
    const payload = upsert.mock.calls[0][0]
    expect(payload.next_send_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('gibt ok:false weiter, wenn der Upsert einen DB-Fehler liefert', async () => {
    const { db } = mockDb(0, { message: 'db down' })
    const r = await enrolleWerkstatt(db, 'w4')
    expect(r.ok).toBe(false)
  })
})
