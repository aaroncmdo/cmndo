// src/lib/offline/handlers/fall-dokument-upload.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const uploadMock = vi.fn()
const insertSingleMock = vi.fn()
const getUserMock = vi.fn(async () => ({ data: { user: { id: 'u1' } } }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: uploadMock }) },
    from: () => ({ insert: () => ({ select: () => ({ single: insertSingleMock }) }) }),
    auth: { getUser: getUserMock },
  }),
}))
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))

import { fallDokumentUploadHandler } from './fall-dokument-upload'
import type { OutboxOp } from '../ops'

const op: OutboxOp = {
  id: 1, kind: 'fall_dokument_upload', idempotency_key: 'idem-1', replay_class: 'A',
  payload: { fall_id: 'f1', dokument_typ: 'schadensfoto', ist_pflicht: true, ab_phase: null },
  blob: new Blob(['x'], { type: 'image/png' }),
  blob_meta: { file_name: 'a.png', content_type: 'image/png', file_size: 1 },
  entity_ref: { scope: 'fall', id: 'f1' }, status: 'pending', retry_count: 0, last_attempt_at: null, created_at: 1,
}

beforeEach(() => { uploadMock.mockReset(); insertSingleMock.mockReset() })

describe('fallDokumentUploadHandler', () => {
  it('done on successful upload + insert', async () => {
    uploadMock.mockResolvedValue({ error: null })
    insertSingleMock.mockResolvedValue({ data: { id: 'doc1' }, error: null })
    expect(await fallDokumentUploadHandler.replay!(op)).toEqual({ outcome: 'done' })
  })
  it('done on 23505 (already synced)', async () => {
    uploadMock.mockResolvedValue({ error: null })
    insertSingleMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'dup' } })
    expect(await fallDokumentUploadHandler.replay!(op)).toEqual({ outcome: 'done' })
  })
  it('retry on storage error', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'net' } })
    const r = await fallDokumentUploadHandler.replay!(op)
    expect(r.outcome).toBe('retry')
  })
  it('retry when insert returns no row', async () => {
    uploadMock.mockResolvedValue({ error: null })
    insertSingleMock.mockResolvedValue({ data: null, error: null })
    const r = await fallDokumentUploadHandler.replay!(op)
    expect(r.outcome).toBe('retry')
  })
})
