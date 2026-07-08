import { describe, it, expect } from 'vitest'
import { resolveAssigneeProfileId } from '../assignee-profile'

function fakeDb(svProfile: string | null) {
  return {
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: t === 'sachverstaendige' ? { profile_id: svProfile } : null }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof resolveAssigneeProfileId>[0]
}

describe('resolveAssigneeProfileId', () => {
  it('sachverstaendiger -> sachverstaendige.profile_id', async () => {
    expect(await resolveAssigneeProfileId(fakeDb('p-sv'), 'sachverstaendiger', 'sv-1')).toBe('p-sv')
  })
  it('kundenbetreuer -> assigneeId (ist schon profile_id)', async () => {
    expect(await resolveAssigneeProfileId(fakeDb(null), 'kundenbetreuer', 'p-kb')).toBe('p-kb')
  })
  it('unbekannter Typ (kanzlei) -> null', async () => {
    expect(await resolveAssigneeProfileId(fakeDb(null), 'kanzlei', 'x')).toBeNull()
  })
  it('null-inputs -> null', async () => {
    expect(await resolveAssigneeProfileId(fakeDb(null), null, null)).toBeNull()
  })
  it('sachverstaendiger ohne profile_id -> null', async () => {
    expect(await resolveAssigneeProfileId(fakeDb(null), 'sachverstaendiger', 'sv-x')).toBeNull()
  })
})
