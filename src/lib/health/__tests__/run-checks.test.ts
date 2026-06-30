// TDD-Tests fuer runAllChecks (Registry + Runner).
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task6
//
// Getestete Faelle:
//   1. Werfender Check -> { status: 'error', detail: <message> }, ok-Check laeuft trotzdem
//   2. Ergebnis-Laenge == 2
//   3. Reihenfolge erhalten (throwing zuerst, ok danach)
//   4. Nicht-Error-Instanz (string throw) -> String(e)
//   5. Ok-Check liefert sein echtes Ergebnis unveraendert

import { describe, it, expect } from 'vitest'
import type { HealthCheck, CheckCtx, CheckResult } from '@/lib/health/types'
import { runAllChecks } from '@/lib/health/run-checks'

// Dummy-ctx — kein echter Supabase-Client noetig fuer Unit-Tests
const dummyCtx = {} as CheckCtx

const throwingCheck: HealthCheck = {
  id: 'test-throwing',
  category: 'funnel',
  title: 'Werfender Test-Check',
  run: async (_ctx: CheckCtx): Promise<CheckResult> => {
    throw new Error('intentional test error')
  },
}

const okCheck: HealthCheck = {
  id: 'test-ok',
  category: 'config',
  title: 'Ok Test-Check',
  run: async (_ctx: CheckCtx): Promise<CheckResult> => ({
    status: 'ok',
    metric: 42,
    detail: 'Alles in Ordnung.',
  }),
}

const stringThrowCheck: HealthCheck = {
  id: 'test-string-throw',
  category: 'sends',
  title: 'String-Throw Test-Check',
  run: async (_ctx: CheckCtx): Promise<CheckResult> => {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw 'raw string error'
  },
}

describe('runAllChecks', () => {
  it('faengt Fehler eines werfenden Checks und liefert status=error', async () => {
    const results = await runAllChecks(dummyCtx, [throwingCheck])
    expect(results).toHaveLength(1)
    expect(results[0].check).toBe(throwingCheck)
    expect(results[0].result.status).toBe('error')
    expect(results[0].result.detail).toBe('intentional test error')
  })

  it('ok-Check laeuft trotz werfendem Check und liefert sein Ergebnis', async () => {
    const results = await runAllChecks(dummyCtx, [throwingCheck, okCheck])
    expect(results).toHaveLength(2)

    const okEntry = results.find((r) => r.check.id === 'test-ok')
    expect(okEntry).toBeDefined()
    expect(okEntry!.result.status).toBe('ok')
    expect(okEntry!.result.metric).toBe(42)
    expect(okEntry!.result.detail).toBe('Alles in Ordnung.')
  })

  it('gibt Ergebnis-Array mit Laenge 2 zurueck (1 throwing + 1 ok)', async () => {
    const results = await runAllChecks(dummyCtx, [throwingCheck, okCheck])
    expect(results).toHaveLength(2)
  })

  it('erhaelt die Reihenfolge der Checks (throwing zuerst, ok danach)', async () => {
    const results = await runAllChecks(dummyCtx, [throwingCheck, okCheck])
    expect(results[0].check.id).toBe('test-throwing')
    expect(results[1].check.id).toBe('test-ok')
  })

  it('String-Throw (kein Error-Objekt) -> detail = String(e)', async () => {
    const results = await runAllChecks(dummyCtx, [stringThrowCheck])
    expect(results[0].result.status).toBe('error')
    expect(results[0].result.detail).toBe('raw string error')
  })

  it('wirft selbst nicht (Promise resolved immer)', async () => {
    await expect(runAllChecks(dummyCtx, [throwingCheck, okCheck])).resolves.toBeDefined()
  })

  it('leeres checks-Array -> leeres Ergebnis-Array', async () => {
    const results = await runAllChecks(dummyCtx, [])
    expect(results).toHaveLength(0)
  })
})
