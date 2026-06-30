// TDD-Tests fuer reminders-overdue Health-Check.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task3
// Kein echter DB-Zugriff — Fake-CheckCtx mit Supabase-Stubs.
//
// Der Check liest task_reminders mit zwei Queries:
//   1. Overdue: .select('geplant_fuer').eq('status','pending').lt('geplant_fuer', cutoff2h)
//      -> Zeilen mit geplant_fuer-Timestamps; JS aggregiert overdue=length, aeltester_h=max age
//   2. Failure-Rate 48h: .select('status').gte('created_at', cutoff48h)
//      -> Zeilen mit status-Werten; JS aggregiert failed=filter('failed').length, total=length
//
// Schwellen:
//   ok:   overdue=0 UND (total<5 ODER failed/total<=0.2)
//   warn: overdue>=1 ODER (total>=5 UND failed/total>0.2)
//   crit: aeltester_h > 24

import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { remindersOverdueCheck } from '../reminders-overdue'

// ---------------------------------------------------------------------------
// Hilfsfunktion: erzeugt einen ISO-String, der `ageH` Stunden in der Vergangenheit liegt.
// ---------------------------------------------------------------------------
function hoursAgoIso(ageH: number): string {
  return new Date(Date.now() - ageH * 3_600_000).toISOString()
}

// ---------------------------------------------------------------------------
// Stub-Factory: zwei sequentielle .from('task_reminders')-Aufrufe.
//
// overdueSpec: { overdue: Anzahl Zeilen; aeltesterH: Alter der aeltesten in Stunden }
// rateSpec:    { failed: Anzahl failed-Zeilen; total: Gesamtzahl Zeilen in 48h }
//
// Query 1 (overdue) liefert overdueSpec.overdue Zeilen mit synthetischen geplant_fuer-Timestamps.
// Query 2 (rate)    liefert rateSpec.total Zeilen, davon rateSpec.failed mit status='failed'.
// ---------------------------------------------------------------------------
function makeCtx(
  overdueSpec: { overdue: number | null; aeltesterH: number | null },
  rateSpec: { failed: number | null; total: number | null },
): CheckCtx {
  const nOverdue = overdueSpec.overdue ?? 0
  const aeltesterH = overdueSpec.aeltesterH

  // Overdue-Zeilen: aelteste bekommt aeltesterH, Rest 1h juenger
  const overdueRows: { geplant_fuer: string }[] =
    nOverdue === 0
      ? []
      : Array.from({ length: nOverdue }, (_, i) => ({
          geplant_fuer: hoursAgoIso(aeltesterH !== null ? (i === 0 ? aeltesterH : aeltesterH - 1) : 3),
        }))

  // Rate-Zeilen: failed-Anzahl davon, Rest als 'sent'
  const nFailed = rateSpec.failed ?? 0
  const nTotal = rateSpec.total ?? 0
  const rateRows: { status: string }[] = [
    ...Array.from({ length: nFailed }, () => ({ status: 'failed' })),
    ...Array.from({ length: nTotal - nFailed }, () => ({ status: 'sent' })),
  ]

  let callCount = 0

  const supabase = {
    from(table: string) {
      if (table !== 'task_reminders') {
        throw new Error(`unerwartete Tabelle: ${table}`)
      }
      callCount++
      const currentCall = callCount

      if (currentCall === 1) {
        // Query 1: .select('geplant_fuer').eq('status','pending').lt('geplant_fuer', cutoff)
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              lt: (_col2: string, _cutoff: string) =>
                Promise.resolve({ data: overdueRows, error: null }),
            }),
          }),
        }
      }

      // Query 2: .select('status').gte('created_at', cutoff48h)
      return {
        select: (_cols: string) => ({
          gte: (_col: string, _cutoff: string) =>
            Promise.resolve({ data: rateRows, error: null }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeErrCtx(errorMessage: string): CheckCtx {
  let callCount = 0
  const supabase = {
    from(_table: string) {
      callCount++
      const currentCall = callCount

      if (currentCall === 1) {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              lt: (_col2: string, _cutoff: string) =>
                Promise.resolve({ data: null, error: { message: errorMessage } }),
            }),
          }),
        }
      }

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

describe('remindersOverdueCheck', () => {
  it('hat korrekte id und category', () => {
    expect(remindersOverdueCheck.id).toBe('reminders-overdue')
    expect(remindersOverdueCheck.category).toBe('cron')
  })

  it('liefert ok wenn 0 overdue und 0 failed (Nullfall)', async () => {
    const ctx = makeCtx({ overdue: 0, aeltesterH: null }, { failed: 0, total: 0 })
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('liefert ok wenn Daten-Zeilen komplett null sind', async () => {
    const ctx = makeCtx({ overdue: null, aeltesterH: null }, { failed: null, total: null })
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('liefert ok wenn total < 5 (Floor) auch bei hoher Fehlerrate', async () => {
    // 2 von 4 = 50% aber total<5 -> ok (solange kein overdue)
    const ctx = makeCtx({ overdue: 0, aeltesterH: null }, { failed: 2, total: 4 })
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.status).toBe('ok')
  })

  it('liefert warn wenn overdue >= 1', async () => {
    const ctx = makeCtx({ overdue: 1, aeltesterH: 3 }, { failed: 0, total: 2 })
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(1)
    expect(result.detail).toContain('1')
  })

  it('liefert warn wenn total >= 5 und failed/total > 0.2', async () => {
    // 3/10 = 30% > 20% und total>=5
    const ctx = makeCtx({ overdue: 0, aeltesterH: null }, { failed: 3, total: 10 })
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('Fehlerrate')
  })

  it('liefert ok wenn total >= 5 und failed/total genau 0.2 (Grenzfall: nicht > 0.2)', async () => {
    // 1/5 = 20% -- nicht ueber Schwelle
    const ctx = makeCtx({ overdue: 0, aeltesterH: null }, { failed: 1, total: 5 })
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.status).toBe('ok')
  })

  it('liefert crit wenn aeltester_overdue_h > 24', async () => {
    const ctx = makeCtx({ overdue: 2, aeltesterH: 25 }, { failed: 0, total: 3 })
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.status).toBe('crit')
    expect(result.metric).toBe(2)
  })

  it('liefert crit bei genau 25h (Grenzfall: > 24)', async () => {
    const ctx = makeCtx({ overdue: 1, aeltesterH: 25 }, { failed: 0, total: 0 })
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.status).toBe('crit')
  })

  it('liefert warn bei genau 24h (Grenzfall: nicht > 24)', async () => {
    const ctx = makeCtx({ overdue: 1, aeltesterH: 24 }, { failed: 0, total: 0 })
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.status).toBe('warn')
  })

  it('detail enthaelt Anzahl overdue-Reminders', async () => {
    const ctx = makeCtx({ overdue: 4, aeltesterH: 10 }, { failed: 0, total: 1 })
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.detail).toContain('4')
  })

  it('detail nennt Fehlerrate wenn relevant', async () => {
    const ctx = makeCtx({ overdue: 0, aeltesterH: null }, { failed: 4, total: 10 })
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.detail).toContain('Fehlerrate')
    expect(result.detail).toMatch(/\d/)
  })

  it('liefert error bei DB-Fehler', async () => {
    const ctx = makeErrCtx('timeout')
    const result = await remindersOverdueCheck.run(ctx)
    expect(result.status).toBe('error')
    expect(result.detail).toContain('timeout')
  })
})
