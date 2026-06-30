// TDD-Tests fuer email-failure-rate Health-Check.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task4
// Kein echter DB-Zugriff — Fake-CheckCtx mit Supabase-Stub.
//
// Der Check liest email_log:
//   .select('status').gte('created_at', cutoff24h)
//   -> Zeilen mit status-Werten; JS aggregiert:
//      sent  = rows mit status='sent'
//      failed = rows mit status in ('failed','bounced')
//      total  = sent + failed
// Schwellen:
//   total < 5   -> ok (Floor)
//   rate <= 0.1 -> ok
//   rate > 0.1  -> warn
//   rate > 0.3  -> crit

import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { emailFailureRateCheck } from '../email-failure-rate'

// ---------------------------------------------------------------------------
// Stub-Factory: liefert CheckCtx, deren supabase.from('email_log')
// ein Zeilen-Array { status } zurueckgibt.
// ---------------------------------------------------------------------------
function makeCtx(sent: number, failed: number, bounced = 0): CheckCtx {
  const rows: { status: string }[] = [
    ...Array.from({ length: sent }, () => ({ status: 'sent' })),
    ...Array.from({ length: failed }, () => ({ status: 'failed' })),
    ...Array.from({ length: bounced }, () => ({ status: 'bounced' })),
  ]

  const supabase = {
    from(table: string) {
      if (table !== 'email_log') {
        throw new Error(`unerwartete Tabelle: ${table}`)
      }
      // Simuliert: .select('status').gte('created_at', cutoff) -> Array
      return {
        select: (_cols: string) => ({
          gte: (_col: string, _cutoff: string) =>
            Promise.resolve({ data: rows, error: null }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeErrCtx(errorMessage: string): CheckCtx {
  const supabase = {
    from(_table: string) {
      return {
        select: (_cols: string) => ({
          gte: (_col: string, _cutoff: string) =>
            Promise.resolve({ data: null, error: { message: errorMessage } }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

describe('emailFailureRateCheck', () => {
  it('hat korrekte id und category', () => {
    expect(emailFailureRateCheck.id).toBe('email-failure-rate')
    expect(emailFailureRateCheck.category).toBe('sends')
  })

  it('liefert ok wenn total < 5 (Floor) — z.B. 0 sent, 0 failed', async () => {
    const ctx = makeCtx(0, 0)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('ok')
  })

  it('liefert ok wenn total < 5 (Floor) — auch bei 100% Fehlerrate', async () => {
    // 3 failed, 0 sent -> total=3 < 5 -> ok
    const ctx = makeCtx(0, 3)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('ok')
  })

  it('liefert ok bei 1/20 = 5% (unter 10%-Schwelle)', async () => {
    const ctx = makeCtx(19, 1)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('ok')
    expect(result.metric).toBeCloseTo(0.05, 2)
  })

  it('liefert ok bei genau 10% Fehlerrate (Grenzfall: nicht > 0.1)', async () => {
    // 1/10 = 10%
    const ctx = makeCtx(9, 1)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('ok')
  })

  it('liefert warn bei 3/20 = 15% (ueber 10%, unter 30%)', async () => {
    const ctx = makeCtx(17, 3)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('warn')
    expect(result.metric).toBeCloseTo(0.15, 2)
  })

  it('liefert warn bei knapp ueber 10% — 2/15', async () => {
    const ctx = makeCtx(13, 2)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('warn')
  })

  it('liefert crit bei 7/20 = 35% (ueber 30%)', async () => {
    const ctx = makeCtx(13, 7)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('crit')
    expect(result.metric).toBeCloseTo(0.35, 2)
  })

  it('liefert crit bei genau 31% (Grenzfall: > 0.3)', async () => {
    // 31 failed, 69 sent -> rate=0.31
    const ctx = makeCtx(69, 31)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('crit')
  })

  it('liefert warn bei genau 30% (Grenzfall: nicht > 0.3)', async () => {
    // 3/10 = 30%
    const ctx = makeCtx(7, 3)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('warn')
  })

  it('zaehlt bounced als failed', async () => {
    // 5 sent, 2 bounced -> total=7, rate=2/7 ~ 28.6% -> warn
    const ctx = makeCtx(5, 0, 2)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('warn')
  })

  it('detail enthaelt %-Angabe und failed/total', async () => {
    const ctx = makeCtx(17, 3)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.detail).toMatch(/%|Fehlerrate/i)
    expect(result.detail).toContain('3')
    expect(result.detail).toContain('20')
  })

  it('detail nennt bei ok-Floor wenig Daten', async () => {
    const ctx = makeCtx(2, 0)
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('ok')
    expect(result.detail).toBeDefined()
  })

  it('liefert error bei DB-Fehler', async () => {
    const ctx = makeErrCtx('connection refused')
    const result = await emailFailureRateCheck.run(ctx)
    expect(result.status).toBe('error')
    expect(result.detail).toContain('connection refused')
  })
})
