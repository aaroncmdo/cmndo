import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dedupeKey, listOpenProposals } from './proposals'
import type { ProposalDraft } from './types'

// Mock fuer den listOpenProposals-DB-Loader (quelle-Filter-Test).
// dedupeKey ist pure (node:crypto) — vom Admin-Client-Mock unberuehrt.
const { eqCalls } = vi.hoisted(() => ({ eqCalls: [] as Array<[string, unknown]> }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val])
        return builder
      },
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: [], error: null }),
    }
    return { from: () => builder }
  },
}))

const draft: ProposalDraft = { vorschlagTyp: 'task', zielRolle: 'kundenbetreuer', payload: { titel: 'Kunde anrufen' }, begruendung: 'x' }

describe('dedupeKey', () => {
  it('ist stabil für gleichen Inhalt', () => {
    expect(dedupeKey('c1', draft)).toBe(dedupeKey('c1', draft))
  })
  it('unterscheidet nach Claim, Typ, Rolle und Kern-Payload', () => {
    expect(dedupeKey('c1', draft)).not.toBe(dedupeKey('c2', draft))
    expect(dedupeKey('c1', draft)).not.toBe(dedupeKey('c1', { ...draft, zielRolle: 'admin' }))
    expect(dedupeKey('c1', draft)).not.toBe(dedupeKey('c1', { ...draft, payload: { titel: 'Anderer Task' } }))
  })
  it('ignoriert die Begründung (nur Aktion zählt)', () => {
    expect(dedupeKey('c1', draft)).toBe(dedupeKey('c1', { ...draft, begruendung: 'andere Begründung' }))
  })
})

// ── listOpenProposals quelle-Filter ───────────────────────────────────────────
// Die Orchestrator-Admin-Queue (/admin/ai-vorschlaege) zeigt NUR autonome
// Orchestrator-Vorschlaege. Copilot (In-Claim-Panel) und Aufsicht (/admin/ki-
// aufsicht) haben eigene Flaechen — sie duerfen nicht in die Queue lecken.
describe('listOpenProposals quelle-Filter', () => {
  beforeEach(() => {
    eqCalls.length = 0
  })

  it('zeigt nur quelle=orchestrator (copilot/aufsicht bleiben in ihren Flaechen)', async () => {
    await listOpenProposals()
    expect(eqCalls).toContainEqual(['quelle', 'orchestrator'])
  })
})
