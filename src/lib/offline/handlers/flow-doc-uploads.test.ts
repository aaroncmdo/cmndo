import { describe, it, expect, vi, beforeEach } from 'vitest'
const zb1Mock = vi.hoisted(() => vi.fn())
const poliMock = vi.hoisted(() => vi.fn())
const zeugeMock = vi.hoisted(() => vi.fn())
vi.mock('@/app/flow/[token]/self-service-actions', () => ({
  uploadZb1Flow: zb1Mock,
  uploadPolizeiberichtFlow: poliMock,
  uploadZeugenaussageFlow: zeugeMock,
}))
import {
  flowZb1UploadHandler,
  flowPolizeiberichtUploadHandler,
  flowZeugenaussageUploadHandler,
} from './flow-doc-uploads'
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
const op = (kind: string): OutboxOp => ({
  ...base,
  kind,
  payload: { token: 't', base64: 'AAAA', contentType: 'image/jpeg' },
})
beforeEach(() => {
  zb1Mock.mockReset()
  poliMock.mockReset()
  zeugeMock.mockReset()
})

describe('flow doc-upload handlers', () => {
  it('zb1: ok -> done, ruft uploadZb1Flow(token,base64,contentType); extracted wird ignoriert', async () => {
    zb1Mock.mockResolvedValue({ ok: true, extracted: { kennzeichen: 'B-X 1' } })
    expect(await flowZb1UploadHandler.replay!(op('flow_zb1_upload'))).toEqual({ outcome: 'done' })
    expect(zb1Mock).toHaveBeenCalledWith('t', 'AAAA', 'image/jpeg')
  })
  it('polizeibericht: server {ok:false} (Token ungültig) -> conflict (droppen)', async () => {
    poliMock.mockResolvedValue({ ok: false, error: 'Link ungültig' })
    expect((await flowPolizeiberichtUploadHandler.replay!(op('flow_polizeibericht_upload'))).outcome).toBe('conflict')
  })
  it('zeugenaussage: Netzwerk-Wurf -> retry (Backoff)', async () => {
    zeugeMock.mockRejectedValue(new Error('net'))
    expect((await flowZeugenaussageUploadHandler.replay!(op('flow_zeugenaussage_upload'))).outcome).toBe('retry')
  })
})
