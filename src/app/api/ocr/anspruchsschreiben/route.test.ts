import { describe, it, expect, beforeAll } from 'vitest'
import { POST } from './route'

// Write-Path-Audit 2026-07-01, F2: die Route schreibt forderungspositionen via
// service_role (RLS-Bypass) + fetcht pdf_url serverseitig. Ohne Bearer-CRON_SECRET
// muss sie 401 liefern (kein anon-Write, kein SSRF).

function makeReq(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/ocr/anspruchsschreiben', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ fall_id: 'x', pdf_url: 'http://attacker.example/x.pdf' }),
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/ocr/anspruchsschreiben — F2 Auth-Gate', () => {
  beforeAll(() => {
    process.env.CRON_SECRET = 'test-secret'
  })

  it('401 ohne Authorization-Header', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('401 bei falschem Secret', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer wrong' }))
    expect(res.status).toBe(401)
  })
})
