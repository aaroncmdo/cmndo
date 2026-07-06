import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { postBeitrag, toggleGefaelltMir, melden } from './actions'

beforeEach(() => { rpc.mockReset(); getUser.mockReset() })

describe('netzwerk actions', () => {
  it('postBeitrag ohne Login → ok:false', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await postBeitrag('hi', [])).toEqual({ ok: false, error: 'Bitte zuerst anmelden.' })
  })
  it('postBeitrag mappt RPC-Fehler (entfernt P0001-Prefix)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    rpc.mockResolvedValue({ error: { message: 'P0001: Zu viele Beiträge in kurzer Zeit' } })
    expect(await postBeitrag('hi', [])).toEqual({ ok: false, error: 'Zu viele Beiträge in kurzer Zeit' })
  })
  it('toggleGefaelltMir liefert nowLiked', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    rpc.mockResolvedValue({ data: true, error: null })
    expect(await toggleGefaelltMir('post', 'p1')).toEqual({ ok: true, nowLiked: true })
  })
  it('melden(comment) ruft report_comment, melden(post) ruft report_target', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    rpc.mockResolvedValue({ data: null, error: null })
    await melden('comment', 'c1')
    expect(rpc).toHaveBeenCalledWith('report_comment', { p_comment_id: 'c1' })
    rpc.mockClear()
    await melden('post', 'p1')
    expect(rpc).toHaveBeenCalledWith('report_target', { p_kind: 'post', p_id: 'p1' })
  })
})
