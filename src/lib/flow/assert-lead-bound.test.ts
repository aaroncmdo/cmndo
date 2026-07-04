import { describe, it, expect } from 'vitest'
import { assertLeadBoundToToken } from './assert-lead-bound'

// Minimaler chainable Admin-Mock: emuliert
//   admin.from('flow_links').select('lead_id').eq('token', <token>).maybeSingle()
// flowLinks: token -> { lead_id }. Unbekannter Token -> data null (kein Row).
function fakeAdmin(flowLinks: Record<string, { lead_id: string }>) {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, token: string) => ({
          maybeSingle: async () => ({ data: flowLinks[token] ?? null }),
        }),
      }),
    }),
  }
}

describe('assertLeadBoundToToken (Flow-IDOR-Guard)', () => {
  it('canonical: akzeptiert die eigene leadId des Tokens', async () => {
    const admin = fakeAdmin({ 'tok-A': { lead_id: 'lead-A' } })
    expect(await assertLeadBoundToToken(admin, 'tok-A', 'lead-A')).toBe(true)
  })

  it('canonical: LEHNT eine fremde leadId ab (der IDOR-Kern)', async () => {
    const admin = fakeAdmin({ 'tok-A': { lead_id: 'lead-A' } })
    // Angreifer hat Token tok-A, versucht aber fremdes lead-B zu treffen.
    expect(await assertLeadBoundToToken(admin, 'tok-A', 'lead-B')).toBe(false)
  })

  it('backward-compat (kein flow_links-Row): Token MUSS == leadId sein', async () => {
    const admin = fakeAdmin({}) // kein flow_link zu diesem Token
    expect(await assertLeadBoundToToken(admin, 'lead-X', 'lead-X')).toBe(true)
    expect(await assertLeadBoundToToken(admin, 'lead-X', 'lead-Y')).toBe(false)
  })

  it('null/leerer Token faellt geschlossen aus (fail-closed)', async () => {
    const admin = fakeAdmin({ 'tok-A': { lead_id: 'lead-A' } })
    expect(await assertLeadBoundToToken(admin, null, 'lead-A')).toBe(false)
    expect(await assertLeadBoundToToken(admin, '', 'lead-A')).toBe(false)
  })
})
