import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendEmailMock = vi.fn().mockResolvedValue({ messageId: 'x' })
vi.mock('../client', () => ({ sendEmail: (o: unknown) => sendEmailMock(o) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        generateLink: vi.fn().mockResolvedValue({
          data: { properties: { action_link: 'https://app.claimondo.de/passwort-zuruecksetzen?t=1' } },
          error: null,
        }),
      },
    },
  }),
}))

beforeEach(() => sendEmailMock.mockClear())

describe('sendWillkommenWerkstatt', () => {
  it('sendet mit empfaengerTyp werkstatt und rendert den Magic-Link in html', async () => {
    const { sendWillkommenWerkstatt } = await import('../flows')
    await sendWillkommenWerkstatt({ to: 'w@example.com', werkstattName: 'Test-Werkstatt' })
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const arg = sendEmailMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.to).toBe('w@example.com')
    expect(arg.empfaengerTyp).toBe('werkstatt')
    expect(arg.template).toBe('willkommen_werkstatt')
    // Magic-Link-only: kein Einmalpasswort mehr, dafuer der Recovery-Link.
    expect(arg.html).toContain('passwort-zuruecksetzen')
    expect(arg.html).toContain('Test-Werkstatt')
  }, 20000) // dynamischer import('../flows') laedt den vollen Template-Graph -> Default-5s reicht nicht
})
