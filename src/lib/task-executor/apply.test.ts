// src/lib/task-executor/apply.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/fall/log-event', () => ({ logFallEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/tasks/update-status-core', () => ({ updateTaskStatusCore: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/communications/send-fall', () => ({ sendFallCommunication: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/faelle/state-machine', () => ({
  transitionFallStatus: vi.fn().mockResolvedValue(undefined),
  FALL_STATUS_TRANSITIONS: { 'ersterfassung': ['sv-gesucht'], 'sv-gesucht': [] },
}))

import { applyInterneNotiz, applyTaskSchliessen, applySendeKommunikation, applySetzeStatus } from './apply'
import { logFallEvent } from '@/lib/fall/log-event'
import { updateTaskStatusCore } from '@/lib/tasks/update-status-core'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import type { ExecCtx } from './types'

const ctx: ExecCtx = {
  db: {} as never,
  task: { id: 't1', typ: 'sa_ausstehend', titel: 'SA', beschreibung: null, status: 'offen', claim_id: 'c1', fall_id: 'f1', empfaenger_rolle: null },
  claimId: 'c1', fallId: 'f1', userId: 'u1',
}

beforeEach(() => vi.clearAllMocks())

describe('apply-wrapper', () => {
  it('interne_notiz ruft logFallEvent mit fallId + actor', async () => {
    const r = await applyInterneNotiz({ verb: 'interne_notiz', args: { text: 'Hallo' } }, ctx)
    expect(r.ok).toBe(true)
    expect(logFallEvent).toHaveBeenCalledWith(ctx.db, expect.objectContaining({ fallId: 'f1', actor: 'u1' }))
  })
  it('task_schliessen ruft updateTaskStatusCore(erledigt)', async () => {
    const r = await applyTaskSchliessen({ verb: 'task_schliessen', args: { ergebnis: 'fertig' } }, ctx)
    expect(r.ok).toBe(true)
    expect(updateTaskStatusCore).toHaveBeenCalledWith(ctx.db, 't1', 'erledigt')
  })
  it('task_schliessen faengt throw ab → ok:false', async () => {
    ;(updateTaskStatusCore as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    const r = await applyTaskSchliessen({ verb: 'task_schliessen', args: { ergebnis: 'x' } }, ctx)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('boom')
  })
  it('sende_kommunikation ruft sendFallCommunication(fallId, trigger, variablen)', async () => {
    const r = await applySendeKommunikation({ verb: 'sende_kommunikation', args: { trigger: 'dokumente_nachreichen', variablen: { '1': 'ZB1' } } }, ctx)
    expect(r.ok).toBe(true)
    expect(sendFallCommunication).toHaveBeenCalledWith('f1', 'dokumente_nachreichen', { '1': 'ZB1' })
  })
  it('setze_status ruft transitionFallStatus(fallId, status, {grund,user_id})', async () => {
    const r = await applySetzeStatus({ verb: 'setze_status', args: { neuer_status: 'sv-gesucht', grund: 'kein SV' } }, ctx)
    expect(r.ok).toBe(true)
    expect(transitionFallStatus).toHaveBeenCalledWith('f1', 'sv-gesucht', { grund: 'kein SV', user_id: 'u1' })
  })
  it('sende_kommunikation ohne fallId → ok:false (kein Send)', async () => {
    const r = await applySendeKommunikation({ verb: 'sende_kommunikation', args: { trigger: 'dokumente_nachreichen', variablen: {} } }, { ...ctx, fallId: null })
    expect(r.ok).toBe(false)
    expect(sendFallCommunication).not.toHaveBeenCalled()
  })
})
