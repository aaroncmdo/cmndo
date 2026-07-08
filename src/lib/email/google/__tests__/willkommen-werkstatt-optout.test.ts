import { describe, it, expect, vi, beforeEach } from 'vitest'

// @react-email/render mocken -> hermetisch (kein prettier/Template-HTML noetig; das deckt
// willkommen-werkstatt-flow.test.ts ab). Hier pruefen wir NUR, dass der admin-getriggerte
// Werkstatt-Login-Flow das Send-Isolation-Optout setzt, damit die Mail auch an interne/
// Gruender-Testadressen (@claimondo.de) rausgeht (Root-Cause: kam nie an).
vi.mock('@react-email/render', () => ({
  render: vi.fn().mockResolvedValue('<html>dummy</html>'),
  toPlainText: (s: string) => s ?? '',
}))
// hero-image/store zieht `sharp` (im Werkstatt-Pfad ungenutzt, nur Modul-Top-Import) -> mocken.
vi.mock('@/lib/email/hero-image/store', () => ({
  getOrCreateHeroImageUrl: vi.fn().mockResolvedValue(null),
}))
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

describe('sendWillkommenWerkstatt — Send-Isolation-Optout', () => {
  it('uebergibt allowInternalRecipient:true (Login-Mail erreicht auch @claimondo.de)', async () => {
    const { sendWillkommenWerkstatt } = await import('../flows')
    await sendWillkommenWerkstatt({
      to: 'aaron.sprafke+werkstattneu@claimondo.de',
      werkstattName: 'Claimondo GmbH (i.Gr.)',
    })
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const arg = sendEmailMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.allowInternalRecipient).toBe(true)
    expect(arg.empfaengerTyp).toBe('werkstatt')
    expect(arg.to).toBe('aaron.sprafke+werkstattneu@claimondo.de')
  }, 20000)
})
