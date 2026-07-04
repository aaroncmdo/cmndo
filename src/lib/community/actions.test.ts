import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { postBeitrag, toggleGefaelltMir } from './actions'

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
})
