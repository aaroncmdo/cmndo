import { describe, it, expect, vi, beforeEach } from 'vitest'
const editMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/werkstatt/(shell)/anfragen/actions', () => ({ bearbeiteWerkstattLead: editMock }))
import { werkstattLeadEditHandler } from './werkstatt-lead-edit'
import type { OutboxOp } from '../ops'

const base = {
  id: 1,
  idempotency_key: 'k',
  status: 'pending' as const,
  retry_count: 0,
  last_attempt_at: null,
  created_at: 1,
  replay_class: 'B' as const,
}
const op: OutboxOp = {
  ...base,
  kind: 'werkstatt_lead_edit',
  payload: { leadId: 'l1', patch: { vorname: 'A', kennzeichen: 'B-X 1' } },
}
beforeEach(() => editMock.mockReset())

describe('werkstattLeadEditHandler', () => {
  it('ok -> done, ruft bearbeiteWerkstattLead(leadId,patch)', async () => {
    editMock.mockResolvedValue({ ok: true })
    expect(await werkstattLeadEditHandler.replay!(op)).toEqual({ outcome: 'done' })
    expect(editMock).toHaveBeenCalledWith('l1', { vorname: 'A', kennzeichen: 'B-X 1' })
  })
  it('server {ok:false} (kein Zugriff / konvertiert) -> conflict (droppen)', async () => {
    editMock.mockResolvedValue({ ok: false, error: 'Kein Zugriff' })
    expect((await werkstattLeadEditHandler.replay!(op)).outcome).toBe('conflict')
  })
  it('Wurf im Replay -> retry (Backoff) — catch-Zweig', async () => {
    // Exerziert den catch->retry-Zweig ohne werfenden Mock (vitest v4 + (shell)-Paren-Pfad
    // meldet einen Mock-Throw als unhandled): ein malformter Resolve (undefined) laesst den
    // Handler beim `res.ok`-Zugriff INNERHALB seines try werfen -> gefangen -> retry.
    editMock.mockResolvedValue(undefined)
    expect((await werkstattLeadEditHandler.replay!(op)).outcome).toBe('retry')
  })
})
