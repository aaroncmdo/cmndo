import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()
vi.mock('@/lib/email/resend-client', () => ({ resend: { emails: { send: (...a: unknown[]) => sendMock(...a) } } }))

import { sendColdMail, coldMailFromAddress } from '../send'

beforeEach(() => { sendMock.mockReset(); delete process.env.COLD_MAIL_FROM_DOMAIN })

describe('coldMailFromAddress', () => {
  it('nutzt Default-Subdomain', () => {
    expect(coldMailFromAddress()).toBe('Claimondo Partnernetzwerk <partner@mail.claimondo.de>')
  })
  it('respektiert COLD_MAIL_FROM_DOMAIN', () => {
    process.env.COLD_MAIL_FROM_DOMAIN = 'post.example.de'
    expect(coldMailFromAddress()).toBe('Claimondo Partnernetzwerk <partner@post.example.de>')
  })
})

describe('sendColdMail', () => {
  it('sendet mit List-Unsubscribe-Header + tags und liefert messageId', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_123' }, error: null })
    const res = await sendColdMail({ to: 'a@b.de', subject: 'Hi', html: '<p>x</p>', abmeldeUrl: 'https://app.claimondo.de/abmelden/tok', leadId: 'lead-1' })
    expect(res).toEqual({ ok: true, messageId: 'msg_123' })
    const arg = sendMock.mock.calls[0][0]
    expect(arg.headers['List-Unsubscribe']).toBe('<https://app.claimondo.de/abmelden/tok>')
    expect(arg.tags).toEqual([{ name: 'typ', value: 'cold_mail' }, { name: 'lead', value: 'lead-1' }])
  })
  it('gibt error zurück wenn Resend error liefert', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'domain not verified' } })
    const res = await sendColdMail({ to: 'a@b.de', subject: 'Hi', html: '<p>x</p>', abmeldeUrl: 'u', leadId: 'l' })
    expect(res).toEqual({ ok: false, error: 'domain not verified' })
  })
})
