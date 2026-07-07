import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
import { POST } from './route'
it('401 ohne Login', async () => {
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ fallId: 'f1', messages: [{ role: 'user', content: 'hi' }] }) }) as never)
  expect(res.status).toBe(401)
})
