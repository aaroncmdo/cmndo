// src/lib/ops/get-claim-workitems.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getMyClaimWorkItems } from './get-claim-workitems'
import type { ClaimWorkstateRow } from './claim-workstate.types'

function mockSupabase(rows: ClaimWorkstateRow[], error: unknown = null) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: rows, error })),
  }
  return { from: vi.fn(() => chain) } as any
}
const row: ClaimWorkstateRow = {
  claim_id: 'c1', claim_nummer: 'CLM-1', lead_id: null, kundenbetreuer_id: 'kb1', sv_id: null,
  main_phase: 'begutachtung', sub_phase: 'gutachten', status: null, operative_status: null, ist_aktiv: true,
  kennzeichen: 'K-1', kunde_name: 'Müller', schadenhoehe: 100, sa_unterschrieben: true,
  sv_zugewiesen_am: null, gutachten_eingegangen_am: null, anschlussschreiben_am: null, regulierung_am: null,
  abgeschlossen_am: null, storniert_am: null, updated_at: null, created_at: null,
  dokumente_vollstaendig_fuer_phase: null, vs_eskalationsstufe: null,
  fall_id: null,
}

describe('getMyClaimWorkItems', () => {
  it('liefert abgeleitete WorkItems', async () => {
    const res = await getMyClaimWorkItems(mockSupabase([row]), { kundenbetreuerId: 'kb1' })
    expect(res.ok).toBe(true)
    if (res.ok) { expect(res.items).toHaveLength(1); expect(res.items[0].nextActionCode).toBe('gutachten_ausstehend') }
  })
  it('gibt {ok:false} bei DB-Fehler', async () => {
    const res = await getMyClaimWorkItems(mockSupabase([], { message: 'boom' }), {})
    expect(res.ok).toBe(false)
  })
})
