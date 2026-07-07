// TDD-Tests fuer claims-missing-pflichtdokumente Health-Check.
// Muster: reminders-overdue.test.ts (Fake-CheckCtx, sequentielle .from()-Aufrufe).
// Query 1 (claims):          .select('id').is().is().gt()  -> Kandidaten-Rows {id}
// Query 2 (pflichtdokumente): .select('fall_id').in()       -> abgedeckte Rows {fall_id}
import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { claimsMissingPflichtdokumenteCheck } from '../claims-missing-pflichtdokumente'

function makeCtx(candidateIds: string[], coveredFallIds: string[]): CheckCtx {
  let call = 0
  const supabase = {
    from(_table: string) {
      call++
      if (call === 1) {
        return {
          select: () => ({
            is: () => ({
              is: () => ({
                gt: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }),
              }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          in: () => Promise.resolve({ data: coveredFallIds.map((fall_id) => ({ fall_id })), error: null }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeQ1ErrCtx(msg: string): CheckCtx {
  const supabase = {
    from() {
      return {
        select: () => ({
          is: () => ({ is: () => ({ gt: () => Promise.resolve({ data: null, error: { message: msg } }) }) }),
        }),
      }
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
        return {
          select: () => ({
            is: () => ({ is: () => ({ gt: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }) }) }),
          }),
        }
      }
      return { select: () => ({ in: () => Promise.resolve({ data: null, error: { message: msg } }) }) }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

describe('claimsMissingPflichtdokumenteCheck', () => {
  it('hat korrekte id und category', () => {
    expect(claimsMissingPflichtdokumenteCheck.id).toBe('claims-missing-pflichtdokumente')
    expect(claimsMissingPflichtdokumenteCheck.category).toBe('funnel')
  })

  it('ok wenn keine Kandidaten (leeres 14d-Fenster)', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeCtx([], []))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('ok wenn alle Kandidaten Slots haben', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeCtx(['a', 'b'], ['a', 'b']))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('warn wenn 1 Kandidat ohne Slots', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeCtx(['a', 'b'], ['a']))
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(1)
    expect(result.sampleIds).toEqual(['b'])
  })

  it('crit wenn >= 3 Kandidaten ohne Slots', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeCtx(['a', 'b', 'c', 'd'], ['a']))
    expect(result.status).toBe('crit')
    expect(result.metric).toBe(3)
  })

  it('sampleIds bei > 5 Verletzungen auf 5 begrenzt', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const result = await claimsMissingPflichtdokumenteCheck.run(makeCtx(ids, []))
    expect(result.metric).toBe(7)
    expect(result.sampleIds).toHaveLength(5)
  })

  it('error bei DB-Fehler in Query 1', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeQ1ErrCtx('timeout'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('timeout')
  })

  it('error bei DB-Fehler in Query 2', async () => {
    const result = await claimsMissingPflichtdokumenteCheck.run(makeQ2ErrCtx(['a'], 'boom'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('boom')
  })
})
