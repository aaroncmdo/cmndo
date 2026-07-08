// TDD-Tests fuer claims-missing-geschaedigter Health-Check.
// Query 1 (claims):        .select('id').is('deaktiviert_am', null)          -> {id}
// Query 2 (claim_parties): .select('claim_id').eq('rolle',…).in('claim_id',…) -> {claim_id}
import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { claimsMissingGeschaedigterCheck } from '../claims-missing-geschaedigter'

function makeCtx(candidateIds: string[], coveredClaimIds: string[]): CheckCtx {
  let call = 0
  const supabase = {
    from(_table: string) {
      call++
      if (call === 1) {
        return {
          select: () => ({
            is: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: coveredClaimIds.map((claim_id) => ({ claim_id })), error: null }),
          }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeQ1ErrCtx(msg: string): CheckCtx {
  const supabase = {
    from() {
      return { select: () => ({ is: () => Promise.resolve({ data: null, error: { message: msg } }) }) }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeQ2ErrCtx(candidateIds: string[], msg: string): CheckCtx {
  let call = 0
  const supabase = {
    from() {
      call++
      if (call === 1) {
        return { select: () => ({ is: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }) }) }
      }
      return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: null, error: { message: msg } }) }) }) }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

describe('claimsMissingGeschaedigterCheck', () => {
  it('hat korrekte id und category', () => {
    expect(claimsMissingGeschaedigterCheck.id).toBe('claims-missing-geschaedigter')
    expect(claimsMissingGeschaedigterCheck.category).toBe('funnel')
  })

  it('ok wenn keine aktiven Claims', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeCtx([], []))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('ok wenn alle Claims eine geschädigte Partei haben', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeCtx(['c1', 'c2'], ['c1', 'c2']))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('warn wenn 1 Claim ohne geschädigte Partei', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeCtx(['c1', 'c2'], ['c1']))
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(1)
    expect(result.sampleIds).toEqual(['c2'])
  })

  it('crit wenn >= 3 Claims ohne geschädigte Partei', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeCtx(['c1', 'c2', 'c3', 'c4'], ['c1']))
    expect(result.status).toBe('crit')
    expect(result.metric).toBe(3)
  })

  it('sampleIds bei > 5 Verletzungen auf 5 begrenzt', async () => {
    const ids = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']
    const result = await claimsMissingGeschaedigterCheck.run(makeCtx(ids, []))
    expect(result.metric).toBe(6)
    expect(result.sampleIds).toHaveLength(5)
  })

  it('error bei DB-Fehler in Query 1', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeQ1ErrCtx('timeout'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('timeout')
  })

  it('error bei DB-Fehler in Query 2', async () => {
    const result = await claimsMissingGeschaedigterCheck.run(makeQ2ErrCtx(['c1'], 'boom'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('boom')
  })
})
