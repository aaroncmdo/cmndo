import { describe, it, expect, vi, beforeEach } from 'vitest'
const stammMock = vi.hoisted(() => vi.fn())
const festMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/flow/[token]/actions', () => ({ updateLeadStammdaten: stammMock }))
vi.mock('@/app/flow/[token]/self-service-feststellung-actions', () => ({ speichereFeststellungFlow: festMock }))
import { flowStammdatenHandler, flowFeststellungHandler } from './flow-field-sets'
import type { OutboxOp } from '../ops'

const base = { id: 1, idempotency_key: 'k', status: 'pending' as const, retry_count: 0, last_attempt_at: null, created_at: 1 }
const stammOp: OutboxOp = { ...base, kind: 'flow_stammdaten', replay_class: 'B', payload: { leadId: 'l1', data: { vorname: 'A' }, token: 't' } }
const festOp: OutboxOp = { ...base, kind: 'flow_feststellung', replay_class: 'B', payload: { token: 't', values: { x: 1 } } }
beforeEach(() => { stammMock.mockReset(); festMock.mockReset() })

describe('flowStammdatenHandler', () => {
  it('replays updateLeadStammdaten(leadId,data,token) -> done', async () => {
    stammMock.mockResolvedValue({ success: true })
    expect(await flowStammdatenHandler.replay!(stammOp)).toEqual({ outcome: 'done' })
    expect(stammMock).toHaveBeenCalledWith('l1', { vorname: 'A' }, 't')
  })
  it('server {success:false} (e.g. token expired) -> conflict (drop, no infinite retry)', async () => {
    stammMock.mockResolvedValue({ success: false, error: 'Link abgelaufen' })
    expect((await flowStammdatenHandler.replay!(stammOp)).outcome).toBe('conflict')
  })
  it('network throw -> retry', async () => {
    stammMock.mockRejectedValue(new Error('net'))
    expect((await flowStammdatenHandler.replay!(stammOp)).outcome).toBe('retry')
  })
})

describe('flowFeststellungHandler', () => {
  it('replays speichereFeststellungFlow(token,values) -> done', async () => {
    festMock.mockResolvedValue({ ok: true })
    expect(await flowFeststellungHandler.replay!(festOp)).toEqual({ outcome: 'done' })
    expect(festMock).toHaveBeenCalledWith('t', { x: 1 })
  })
  it('server {ok:false} -> conflict; network throw -> retry', async () => {
    festMock.mockResolvedValue({ ok: false, error: 'x' })
    expect((await flowFeststellungHandler.replay!(festOp)).outcome).toBe('conflict')
    festMock.mockRejectedValue(new Error('net'))
    expect((await flowFeststellungHandler.replay!(festOp)).outcome).toBe('retry')
  })
})
