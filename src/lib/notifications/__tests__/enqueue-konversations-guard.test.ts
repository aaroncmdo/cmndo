import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const upsertMock = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (...args: unknown[]) => {
        upsertMock(...args)
        return { select: () => Promise.resolve({ data: [{ id: 'new-row' }], error: null }) }
      },
    }),
  }),
}))
vi.mock('@/lib/whatsapp/konversations-guard', () => ({
  hatKuerzlichMenschlicheKonversation: vi.fn(),
}))

import { enqueue } from '../outbox'
import { hatKuerzlichMenschlicheKonversation } from '@/lib/whatsapp/konversations-guard'

const mockedGuard = vi.mocked(hatKuerzlichMenschlicheKonversation)

describe('enqueue — Konversations-Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}'))))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('unterdrueckt einen Reminder bei aktiver Konversation — kein Outbox-Insert', async () => {
    mockedGuard.mockResolvedValue(true)
    const r = await enqueue({
      dedupKey: 'dokumente_nachreichen:c1',
      kanal: 'whatsapp',
      template: 'dokumente_nachreichen',
      claimId: 'c1',
    })
    expect(r).toEqual({ ok: true, enqueued: false })
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('sendet den Reminder ohne aktive Konversation — Insert laeuft', async () => {
    mockedGuard.mockResolvedValue(false)
    const r = await enqueue({
      dedupKey: 'dokumente_nachreichen:c1',
      kanal: 'whatsapp',
      template: 'dokumente_nachreichen',
      claimId: 'c1',
    })
    expect(mockedGuard).toHaveBeenCalledWith(expect.anything(), { claimId: 'c1' })
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(r.enqueued).toBe(true)
  })

  it('kritische Templates (fall_eroeffnet) laufen OHNE Guard-Check', async () => {
    const r = await enqueue({
      dedupKey: 'fall_eroeffnet:c1',
      kanal: 'whatsapp',
      template: 'fall_eroeffnet',
      claimId: 'c1',
    })
    expect(mockedGuard).not.toHaveBeenCalled()
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(r.enqueued).toBe(true)
  })

  it('nicht-WhatsApp-Kanaele (email) sind vom Konversations-Guard unberuehrt', async () => {
    const r = await enqueue({
      dedupKey: 'dokumente_nachreichen:c1',
      kanal: 'email',
      template: 'dokumente_nachreichen',
      claimId: 'c1',
    })
    expect(mockedGuard).not.toHaveBeenCalled()
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(r.enqueued).toBe(true)
  })
})
