import { describe, it, expect } from 'vitest'
import { resolveNetzwerkOwnerProfilId } from '../resolve-netzwerk-owner'

// Fake: from('claims'|'profiles').select().eq().maybeSingle() -> rowByTable
function fakeDb(rowByTable: Record<string, unknown>) {
  const make = (table: string) => {
    const c: any = {}
    c.select = () => c
    c.eq = () => c
    c.maybeSingle = () => Promise.resolve({ data: rowByTable[table] ?? null, error: null })
    return c
  }
  return { from: (t: string) => make(t) } as any
}

describe('resolveNetzwerkOwnerProfilId (Praezedenz per-Claim > Kunden-Default > null)', () => {
  it('claims.netzwerk_owner_id gesetzt -> gewinnt (kein profiles-Read noetig)', async () => {
    const db = fakeDb({
      claims: { netzwerk_owner_id: 'owner-claim', geschaedigter_user_id: 'kunde-1' },
      profiles: { netzwerk_owner_id: 'owner-kunde' },
    })
    expect(await resolveNetzwerkOwnerProfilId(db, { claimId: 'c1' })).toBe('owner-claim')
  })
  it('Claim-Owner NULL, Kunden-Default gesetzt -> Kunden-Default', async () => {
    const db = fakeDb({
      claims: { netzwerk_owner_id: null, geschaedigter_user_id: 'kunde-1' },
      profiles: { netzwerk_owner_id: 'owner-kunde' },
    })
    expect(await resolveNetzwerkOwnerProfilId(db, { claimId: 'c1' })).toBe('owner-kunde')
  })
  it('beide NULL -> null', async () => {
    const db = fakeDb({
      claims: { netzwerk_owner_id: null, geschaedigter_user_id: 'kunde-1' },
      profiles: { netzwerk_owner_id: null },
    })
    expect(await resolveNetzwerkOwnerProfilId(db, { claimId: 'c1' })).toBeNull()
  })
  it('Claim ohne geschaedigter_user_id -> null (kein profiles-Lookup)', async () => {
    const db = fakeDb({
      claims: { netzwerk_owner_id: null, geschaedigter_user_id: null },
    })
    expect(await resolveNetzwerkOwnerProfilId(db, { claimId: 'c1' })).toBeNull()
  })
  it('Claim nicht gefunden -> null', async () => {
    expect(await resolveNetzwerkOwnerProfilId(fakeDb({}), { claimId: 'weg' })).toBeNull()
  })
})
