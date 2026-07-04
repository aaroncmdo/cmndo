// TDD-Tests fuer twilio-send-failures Health-Check.
// twilio_status_events loggt NUR fehlgeschlagene Sends (failed/undelivered) — kein
// Total-Sends-Log fuer eine Quote -> absoluter Cluster-Zaehler im 7-Tage-Fenster.

import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import {
  twilioSendFailuresCheck,
  evaluateSendFailures,
  type SendFailureRow,
} from '../twilio-send-failures'

const rows = (n: number, code: string | null = '63016'): SendFailureRow[] =>
  Array.from({ length: n }, () => ({ error_code: code }))

describe('evaluateSendFailures (rein)', () => {
  it('0 Failures => ok', () => {
    const r = evaluateSendFailures([], 5, 20, 7)
    expect(r.status).toBe('ok')
    expect(r.metric).toBe(0)
    expect(r.detail).toMatch(/keine/i)
  })

  it('unter warnAb => ok', () => {
    expect(evaluateSendFailures(rows(4), 5, 20, 7).status).toBe('ok')
  })

  it('>= warnAb, < critAb => warn', () => {
    expect(evaluateSendFailures(rows(5), 5, 20, 7).status).toBe('warn')
    expect(evaluateSendFailures(rows(19), 5, 20, 7).status).toBe('warn')
  })

  it('>= critAb => crit', () => {
    expect(evaluateSendFailures(rows(20), 5, 20, 7).status).toBe('crit')
  })

  it('nennt den haeufigsten Fehlercode im Detail (Debug)', () => {
    const mixed: SendFailureRow[] = [...rows(3, '63016'), ...rows(1, '30008')]
    const r = evaluateSendFailures(mixed, 5, 20, 7)
    expect(r.detail).toContain('63016')
    expect(r.metric).toBe(4)
  })

  it('behandelt null-error_code ohne Crash', () => {
    const r = evaluateSendFailures(rows(6, null), 5, 20, 7)
    expect(r.status).toBe('warn')
    expect(r.metric).toBe(6)
  })
})

function makeCtx(n: number, errorMessage?: string): CheckCtx {
  const data: SendFailureRow[] = Array.from({ length: n }, () => ({ error_code: '63016' }))
  const supabase = {
    from(_t: string) {
      return {
        select: (_c: string) => ({
          gte: (_col: string, _v: string) =>
            errorMessage
              ? Promise.resolve({ data: null, error: { message: errorMessage } })
              : Promise.resolve({ data, error: null }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase } as unknown as CheckCtx
}

describe('twilioSendFailuresCheck.run', () => {
  it('id/category korrekt', () => {
    expect(twilioSendFailuresCheck.id).toBe('twilio-send-failures')
    expect(twilioSendFailuresCheck.category).toBe('sends')
  })

  it('ok bei 0 Failures', async () => {
    expect((await twilioSendFailuresCheck.run(makeCtx(0))).status).toBe('ok')
  })

  it('crit bei vielen Failures', async () => {
    expect((await twilioSendFailuresCheck.run(makeCtx(25))).status).toBe('crit')
  })

  it('error bei DB-Fehler', async () => {
    const r = await twilioSendFailuresCheck.run(makeCtx(0, 'connection refused'))
    expect(r.status).toBe('error')
    expect(r.detail).toContain('connection refused')
  })
})
