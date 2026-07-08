import { describe, it, expect, beforeEach } from 'vitest'
import { GET } from '../route'

describe('compute-partner-rang Auth', () => {
  beforeEach(() => { process.env.CRON_SECRET = 'test-secret' })
  it('401 ohne Bearer', async () => {
    expect((await GET(new Request('http://x/api/cron/compute-partner-rang'))).status).toBe(401)
  })
  it('401 bei falschem Secret', async () => {
    expect((await GET(new Request('http://x', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401)
  })
})
