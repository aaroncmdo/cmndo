import { describe, it, expect, vi, beforeEach } from 'vitest'
import { persistAndAlert } from '../persist-and-alert'
import type { AlertDeps } from '../persist-and-alert'
import type { CheckCtx, HealthCheck, CheckResult } from '../types'

// ---------------------------------------------------------------------------
// Helpers zum Bauen von Stubs
// ---------------------------------------------------------------------------

function makeCheck(id: string): HealthCheck {
  return {
    id,
    category: 'funnel',
    title: `Check ${id}`,
    run: async () => ({ status: 'ok', detail: 'ok' }),
  }
}

function makeResult(status: CheckResult['status'], detail = 'Testdetail'): CheckResult {
  return { status, detail, metric: 1, sampleIds: ['id-1'] }
}

/**
 * Baut einen minimalen Supabase-Stub.
 * lastRun: letzter Datensatz in health_check_runs (oder null wenn kein vorheriger Lauf).
 * insertFn: optionaler Spy auf das insert.
 */
function makeSupabaseStub(opts: {
  lastRun: { status: string; alerted_at: string | null } | null
  // Juengster TATSAECHLICHER Alert-Zeitpunkt (chain 2: eq().not().order().limit()).
  // Bewusst getrennt von lastRun.alerted_at: der letzte Lauf kann korrekt NICHT
  // alarmiert haben (alerted_at=null), obwohl ein frueherer Lauf < 24h alarmierte.
  lastAlertedAt?: string | null
  admins?: Array<{ id: string; email: string }>
  insertSpy?: ReturnType<typeof vi.fn>
}) {
  const admins = opts.admins ?? [{ id: 'admin-1', email: 'admin@claimondo.de' }]

  // Kettenbare Query-Builder-Stubs
  const makeLimitStub = (data: unknown[]) => ({
    data,
    error: null,
  })

  const insertSpy = opts.insertSpy ?? vi.fn().mockResolvedValue({ data: null, error: null })
  const lastRunData = () => makeLimitStub(opts.lastRun ? [opts.lastRun] : [])
  const lastAlertData = () => makeLimitStub(opts.lastAlertedAt ? [{ alerted_at: opts.lastAlertedAt }] : [])

  return {
    from: (table: string) => {
      if (table === 'health_check_runs') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              // Chain 1 (letzter Lauf): eq().order().limit()
              order: (_col2: string, _opts: unknown) => ({
                limit: (_n: number) => Promise.resolve(lastRunData()),
              }),
              // Chain 2 (letzter tatsaechlicher Alert): eq().not().order().limit()
              not: (_col2: string, _op: string, _val2: unknown) => ({
                order: (_col3: string, _opts2: unknown) => ({
                  limit: (_n: number) => Promise.resolve(lastAlertData()),
                }),
              }),
            }),
          }),
          insert: insertSpy,
        }
      }
      if (table === 'profiles') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => Promise.resolve({ data: admins, error: null }),
          }),
        }
      }
      return {}
    },
  } as unknown as CheckCtx['supabase']
}

// ---------------------------------------------------------------------------
// Test-Suite
// ---------------------------------------------------------------------------

describe('persistAndAlert', () => {
  let sendEmail: ReturnType<typeof vi.fn>
  let createMitteilungMulti: ReturnType<typeof vi.fn>
  let recordFailedOperation: ReturnType<typeof vi.fn>
  let markOperationResolved: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendEmail = vi.fn().mockResolvedValue({ messageId: 'msg-1' })
    createMitteilungMulti = vi.fn().mockResolvedValue(undefined)
    recordFailedOperation = vi.fn().mockResolvedValue(undefined)
    markOperationResolved = vi.fn().mockResolvedValue(undefined)
  })

  // Casts benoetigt weil vi.fn() nicht den exakten Funktionstyp traegt.
  const deps = () =>
    ({
      sendEmail,
      createMitteilungMulti,
      recordFailedOperation,
      markOperationResolved,
    }) as unknown as AlertDeps

  // -------------------------------------------------------------------------
  // 1. ok → crit: alle drei Alert-Pfade + alerted_at gesetzt
  // -------------------------------------------------------------------------
  it('ok→crit: alle drei Alert-Pfade gerufen + insert mit alerted_at', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = makeSupabaseStub({ lastRun: { status: 'ok', alerted_at: null }, insertSpy })
    const check = makeCheck('funnel-stuck-claims')
    const result = makeResult('crit', '66 Claims über SLA')

    await persistAndAlert({ supabase }, [{ check, result }], deps())

    // Insert mit alerted_at gesetzt
    expect(insertSpy).toHaveBeenCalledOnce()
    const insertArg = insertSpy.mock.calls[0][0]
    expect(insertArg.alerted_at).toBeTruthy()
    expect(insertArg.status).toBe('crit')
    expect(insertArg.check_id).toBe('funnel-stuck-claims')

    // Email
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ empfaengerTyp: 'admin' })

    // In-App
    expect(createMitteilungMulti).toHaveBeenCalledOnce()
    const [empfaenger, base] = createMitteilungMulti.mock.calls[0]
    expect(empfaenger).toEqual([{ id: 'admin-1', rolle: 'admin' }])
    expect(base.route_url).toBe('/admin/health')
    expect(base.kategorie).toBe('update')

    // Dead-Letter (crit)
    expect(recordFailedOperation).toHaveBeenCalledOnce()
    expect(recordFailedOperation.mock.calls[0][0]).toMatchObject({
      operationType: 'pipeline_health',
      dedupKey: 'health-funnel-stuck-claims',
      entityType: 'health_check',
      entityId: 'funnel-stuck-claims',
    })

    // markOperationResolved NICHT gerufen (kein recovery)
    expect(markOperationResolved).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 2. crit→crit mit last.alerted_at < 24h: KEIN Re-Alert, nur insert
  // -------------------------------------------------------------------------
  it('crit→crit mit alerted_at <24h: kein Re-Alert, aber insert ohne alerted_at', async () => {
    const recentAlerted = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // vor 2h
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = makeSupabaseStub({
      lastRun: { status: 'crit', alerted_at: recentAlerted },
      lastAlertedAt: recentAlerted,
      insertSpy,
    })
    const check = makeCheck('funnel-stuck-claims')
    const result = makeResult('crit', 'immer noch 66 Claims')

    await persistAndAlert({ supabase }, [{ check, result }], deps())

    expect(insertSpy).toHaveBeenCalledOnce()
    const insertArg = insertSpy.mock.calls[0][0]
    // kein Re-Alert → alerted_at null
    expect(insertArg.alerted_at).toBeNull()

    expect(sendEmail).not.toHaveBeenCalled()
    expect(createMitteilungMulti).not.toHaveBeenCalled()
    expect(recordFailedOperation).not.toHaveBeenCalled()
    expect(markOperationResolved).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 3. crit→crit mit last.alerted_at > 24h: Re-Alert
  // -------------------------------------------------------------------------
  it('crit→crit mit alerted_at >24h: Re-Alert (taeglich)', async () => {
    const oldAlerted = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // vor 25h
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = makeSupabaseStub({
      lastRun: { status: 'crit', alerted_at: oldAlerted },
      lastAlertedAt: oldAlerted,
      insertSpy,
    })
    const check = makeCheck('funnel-stuck-claims')
    const result = makeResult('crit', '66 Claims noch immer')

    await persistAndAlert({ supabase }, [{ check, result }], deps())

    expect(insertSpy).toHaveBeenCalledOnce()
    const insertArg = insertSpy.mock.calls[0][0]
    expect(insertArg.alerted_at).toBeTruthy()

    expect(sendEmail).toHaveBeenCalledOnce()
    expect(createMitteilungMulti).toHaveBeenCalledOnce()
    expect(recordFailedOperation).toHaveBeenCalledOnce()
    expect(markOperationResolved).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 3b. crit→crit, vorheriger Lauf hat NICHT alarmiert (alerted_at=null), aber der
  //     juengste TATSAECHLICHE Alert war <24h: KEIN Re-Alert.
  //     Regression fuer den 2-Stunden-Takt-Bug: sustainedCrit pruefte last.alerted_at,
  //     das nach einem stillen Lauf null ist -> alarmierte jeden 2. Lauf statt taeglich.
  // -------------------------------------------------------------------------
  it('crit→crit, letzter Lauf still (alerted_at=null) aber juengster Alert <24h: KEIN Re-Alert', async () => {
    const recentAlerted = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // vor 2h alarmiert
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = makeSupabaseStub({
      lastRun: { status: 'crit', alerted_at: null }, // vorheriger Lauf war korrekt still
      lastAlertedAt: recentAlerted, // aber vor 2h wurde tatsaechlich alarmiert
      insertSpy,
    })
    const check = makeCheck('funnel-stuck-claims')
    const result = makeResult('crit', 'immer noch crit')

    await persistAndAlert({ supabase }, [{ check, result }], deps())

    // Kein Re-Alert: der letzte echte Alert ist erst 2h her (<24h).
    const insertArg = insertSpy.mock.calls[0][0]
    expect(insertArg.alerted_at).toBeNull()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(createMitteilungMulti).not.toHaveBeenCalled()
    expect(recordFailedOperation).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 4. crit → ok: markOperationResolved + Recovery-Mitteilung
  // -------------------------------------------------------------------------
  it('crit→ok: markOperationResolved + Recovery-Mitteilung, kein Alert', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = makeSupabaseStub({
      lastRun: { status: 'crit', alerted_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
      insertSpy,
    })
    const check = makeCheck('webhook-inbound-silent')
    const result = makeResult('ok', 'Webhook wieder aktiv')

    await persistAndAlert({ supabase }, [{ check, result }], deps())

    expect(markOperationResolved).toHaveBeenCalledOnce()
    expect(markOperationResolved).toHaveBeenCalledWith('health-webhook-inbound-silent')

    // Recovery-Mitteilung
    expect(createMitteilungMulti).toHaveBeenCalledOnce()
    const [, base] = createMitteilungMulti.mock.calls[0]
    expect(base.prioritaet).toBe('normal')
    expect(base.titel).toContain('wieder ok')

    // Kein Alert (nicht verschlechtert)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(recordFailedOperation).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 5. Ein werfender Sender: persistAndAlert wirft nicht
  // -------------------------------------------------------------------------
  it('werfender sendEmail: persistAndAlert wirft nicht', async () => {
    sendEmail = vi.fn().mockRejectedValue(new Error('SMTP down'))
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = makeSupabaseStub({ lastRun: { status: 'ok', alerted_at: null }, insertSpy })
    const check = makeCheck('email-failure-rate')
    const result = makeResult('crit', '35% Email-Fehlerrate')

    await expect(
      persistAndAlert({ supabase }, [{ check, result }], { ...deps(), sendEmail } as unknown as AlertDeps)
    ).resolves.toBeUndefined()

    // Insert trotzdem ausgefuehrt
    expect(insertSpy).toHaveBeenCalledOnce()
    // Die anderen Pfade wurden noch versucht (nicht blockiert durch Email-Fehler)
    expect(createMitteilungMulti).toHaveBeenCalled()
    expect(recordFailedOperation).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 6. kein vorheriger Lauf (erster Lauf) + Status = warn: Alert
  // -------------------------------------------------------------------------
  it('kein vorheriger Lauf + warn: Alert (Verschlechterung gegen implizites ok)', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = makeSupabaseStub({ lastRun: null, insertSpy })
    const check = makeCheck('config-required-env')
    const result = makeResult('warn', 'VAPID fehlt')

    await persistAndAlert({ supabase }, [{ check, result }], deps())

    expect(insertSpy).toHaveBeenCalledOnce()
    const insertArg = insertSpy.mock.calls[0][0]
    expect(insertArg.alerted_at).toBeTruthy()

    expect(sendEmail).toHaveBeenCalledOnce()
    expect(createMitteilungMulti).toHaveBeenCalledOnce()
    // warn: kein Dead-Letter
    expect(recordFailedOperation).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 7. ok → ok: kein Alert, kein Recovery
  // -------------------------------------------------------------------------
  it('ok→ok: kein Alert, kein Recovery', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = makeSupabaseStub({ lastRun: { status: 'ok', alerted_at: null }, insertSpy })
    const check = makeCheck('reminders-overdue')
    const result = makeResult('ok', 'Alles in Ordnung')

    await persistAndAlert({ supabase }, [{ check, result }], deps())

    expect(insertSpy).toHaveBeenCalledOnce()
    const insertArg = insertSpy.mock.calls[0][0]
    expect(insertArg.alerted_at).toBeNull()

    expect(sendEmail).not.toHaveBeenCalled()
    expect(createMitteilungMulti).not.toHaveBeenCalled()
    expect(recordFailedOperation).not.toHaveBeenCalled()
    expect(markOperationResolved).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 8. Mehrere Checks: ein werfender Outer-Stub bricht andere nicht
  // -------------------------------------------------------------------------
  it('mehrere Checks: werfender Outer-Stub stoppt andere nicht', async () => {
    // Ein einzelner insertSpy, der beim ersten Aufruf wirft, beim zweiten ok ist.
    let insertCallCount = 0
    const insertSpy = vi.fn().mockImplementation(() => {
      insertCallCount++
      if (insertCallCount === 1) return Promise.reject(new Error('DB-Fehler'))
      return Promise.resolve({ data: null, error: null })
    })

    const supabase = {
      from: (table: string) => {
        if (table === 'health_check_runs') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
                not: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            }),
            insert: insertSpy,
          }
        }
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [{ id: 'admin-1', email: 'a@b.de' }], error: null }),
            }),
          }
        }
        return {}
      },
    } as unknown as CheckCtx['supabase']

    const check1 = makeCheck('check-1')
    const check2 = makeCheck('check-2')

    await expect(
      persistAndAlert(
        { supabase },
        [
          { check: check1, result: makeResult('warn', 'Problem 1') },
          { check: check2, result: makeResult('ok', 'Alles gut') },
        ],
        deps(),
      )
    ).resolves.toBeUndefined()

    // Beide Inserts wurden versucht (check-1 fehlgeschlagen, check-2 ok)
    expect(insertSpy).toHaveBeenCalledTimes(2)
  })
})
