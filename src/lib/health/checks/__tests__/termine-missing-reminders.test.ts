// TDD-Tests fuer termine-missing-reminders Health-Check.
// Query 1 (gutachter_termine): .select('id').gt('start_zeit').eq('status') -> {id}
// Query 2 (termin_reminders):  .select('termin_id').in()                   -> {termin_id}
import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { termineMissingRemindersCheck } from '../termine-missing-reminders'

function makeCtx(candidateIds: string[], coveredTerminIds: string[]): CheckCtx {
  let call = 0
  const supabase = {
    from(_table: string) {
      call++
      if (call === 1) {
        return {
          select: () => ({
            gt: () => ({
              eq: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          in: () => Promise.resolve({ data: coveredTerminIds.map((termin_id) => ({ termin_id })), error: null }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeQ1ErrCtx(msg: string): CheckCtx {
  const supabase = {
    from() {
      return { select: () => ({ gt: () => ({ eq: () => Promise.resolve({ data: null, error: { message: msg } }) }) }) }
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
          select: () => ({ gt: () => ({ eq: () => Promise.resolve({ data: candidateIds.map((id) => ({ id })), error: null }) }) }),
        }
      }
      return { select: () => ({ in: () => Promise.resolve({ data: null, error: { message: msg } }) }) }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

describe('termineMissingRemindersCheck', () => {
  it('hat korrekte id und category', () => {
    expect(termineMissingRemindersCheck.id).toBe('termine-missing-reminders')
    expect(termineMissingRemindersCheck.category).toBe('cron')
  })

  it('ok wenn keine bestätigten Zukunfts-Termine', async () => {
    const result = await termineMissingRemindersCheck.run(makeCtx([], []))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('ok wenn alle Termine Reminder haben', async () => {
    const result = await termineMissingRemindersCheck.run(makeCtx(['t1', 't2'], ['t1', 't2']))
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('warn wenn 1 Termin ohne Reminder', async () => {
    const result = await termineMissingRemindersCheck.run(makeCtx(['t1', 't2'], ['t1']))
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(1)
    expect(result.sampleIds).toEqual(['t2'])
  })

  it('crit wenn >= 3 Termine ohne Reminder', async () => {
    const result = await termineMissingRemindersCheck.run(makeCtx(['t1', 't2', 't3', 't4'], ['t1']))
    expect(result.status).toBe('crit')
    expect(result.metric).toBe(3)
  })

  it('sampleIds bei > 5 Verletzungen auf 5 begrenzt', async () => {
    const ids = ['t1', 't2', 't3', 't4', 't5', 't6']
    const result = await termineMissingRemindersCheck.run(makeCtx(ids, []))
    expect(result.metric).toBe(6)
    expect(result.sampleIds).toHaveLength(5)
  })

  it('error bei DB-Fehler in Query 1', async () => {
    const result = await termineMissingRemindersCheck.run(makeQ1ErrCtx('timeout'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('timeout')
  })

  it('error bei DB-Fehler in Query 2', async () => {
    const result = await termineMissingRemindersCheck.run(makeQ2ErrCtx(['t1'], 'boom'))
    expect(result.status).toBe('error')
    expect(result.detail).toContain('boom')
  })
})
