import { describe, it, expect, vi, beforeEach } from 'vitest'

// Security-Regression: die authed Thread-Wrapper (holeOderErstelle{Direkt,Gruppen}Thread) legen
// Threads/Teilnehmer ueber den SERVICE-Client an (RLS-Bypass). Vorher fehlte der Claim-Zugriffs-
// Check -> jeder eingeloggte User konnte einen DM-Thread an einem BELIEBIGEN Claim mit einem
// BELIEBIGEN User anlegen (und sich selbst als Teilnehmer eintragen) = IDOR. Diese Tests sichern
// das Gate: kein Claim-Zugriff (claims-RLS-Read leer) -> KEIN Thread-Insert.

let state: { user: { id: string } | null; claimSichtbar: boolean }
const adminFrom = vi.fn()
const createAdminClientSpy = vi.fn(() => ({ from: adminFrom, storage: { from: vi.fn() } }))
const gruppenServiceSpy = vi.fn(async (..._a: unknown[]) => 'gruppen-thread-1')

// claims-Read auf dem USER-Client: liefert eine Zeile nur wenn claimSichtbar (RLS-Simulation).
function userClaimsQuery() {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.maybeSingle = async () => ({ data: state.claimSichtbar ? { id: 'claim-x' } : null })
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (t: string) => (t === 'claims' ? userClaimsQuery() : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClientSpy() }))
vi.mock('../thread-service', () => ({
  syncGruppenTeilnehmer: vi.fn(async () => {}),
  resolveClaimUserIds: vi.fn(async () => ({})),
  holeOderErstelleGruppenThreadService: (...a: unknown[]) => gruppenServiceSpy(...a),
}))
vi.mock('../thread-model', () => ({
  sortiereDirektPaar: (a: string, b: string) => [a, b].sort(),
  threadLabel: () => '', leiteDmKandidaten: () => [], rolleLabel: () => '', aggregiereUnreadProClaim: () => ({}),
}))

import { holeOderErstelleDirektThread, holeOderErstelleGruppenThread } from '../thread-actions'

beforeEach(() => {
  state = { user: { id: 'u-1' }, claimSichtbar: true }
  adminFrom.mockReset()
  createAdminClientSpy.mockClear()
  gruppenServiceSpy.mockClear()
})

describe('holeOderErstelleDirektThread — IDOR-Gate', () => {
  it('kein Claim-Zugriff (RLS leer) -> abgewiesen, KEIN Thread-Insert', async () => {
    state.claimSichtbar = false
    const res = await holeOderErstelleDirektThread('fremder-claim', 'u-2')
    expect(res.ok).toBe(false)
    // Der Service-Client darf nicht angefasst worden sein -> kein Thread angelegt.
    expect(createAdminClientSpy).not.toHaveBeenCalled()
    expect(adminFrom).not.toHaveBeenCalled()
  })

  it('nicht eingeloggt -> abgewiesen', async () => {
    state.user = null
    const res = await holeOderErstelleDirektThread('claim-x', 'u-2')
    expect(res.ok).toBe(false)
    expect(createAdminClientSpy).not.toHaveBeenCalled()
  })

  it('mit Claim-Zugriff -> laeuft weiter zum Service-Client', async () => {
    adminFrom.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
      insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'direkt-1' } }) }) }),
    })
    const res = await holeOderErstelleDirektThread('claim-x', 'u-2')
    expect(res.ok).toBe(true)
    expect(createAdminClientSpy).toHaveBeenCalled()
  })
})

describe('holeOderErstelleGruppenThread — IDOR-Gate', () => {
  it('kein Claim-Zugriff -> abgewiesen, Service NICHT gerufen', async () => {
    state.claimSichtbar = false
    const res = await holeOderErstelleGruppenThread('fremder-claim', 'kunde_gruppe')
    expect(res.ok).toBe(false)
    expect(gruppenServiceSpy).not.toHaveBeenCalled()
  })

  it('mit Claim-Zugriff -> Service-Thread', async () => {
    const res = await holeOderErstelleGruppenThread('claim-x', 'team_intern')
    expect(res.ok).toBe(true)
    expect(gruppenServiceSpy).toHaveBeenCalled()
  })
})
