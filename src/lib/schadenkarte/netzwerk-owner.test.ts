import { describe, it, expect } from 'vitest'
import { resolveNetzwerkOwnerFuerFlotte } from './netzwerk-owner'

function mockDb(userId: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: userId ? { user_id: userId } : null, error: null }),
        }),
      }),
    }),
  } as never
}

describe('resolveNetzwerkOwnerFuerFlotte', () => {
  it('mappt firma_id -> firmen_flotten_konten.user_id (= profiles.id)', async () => {
    expect(await resolveNetzwerkOwnerFuerFlotte(mockDb('owner-1'), 'firma-1')).toBe('owner-1')
  })

  it('null wenn die Firma kein Flotten-Konto hat', async () => {
    expect(await resolveNetzwerkOwnerFuerFlotte(mockDb(null), 'firma-x')).toBeNull()
  })
})
