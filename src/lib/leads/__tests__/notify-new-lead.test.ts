import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression-Guard: der Team-Lead-Alert geht an die FESTE interne Inbox info@claimondo.de.
// Ohne allowInternalRecipient:true unterdrueckt die Send-Isolation (client.ts, live-Modus)
// die Mail komplett -> der Alert kam seit #3537 (04.07.) nie beim Team an. Dieser Test pinnt
// das Optout, damit der Silent-Failure nicht zurueckkehrt.
//
// sendEmail + notifyTeamWhatsApp werden gemockt -> kein echter Versand, hermetisch.
const sendEmailMock = vi.fn().mockResolvedValue({ messageId: 'x' })
vi.mock('@/lib/email/google/client', () => ({ sendEmail: (o: unknown) => sendEmailMock(o) }))
vi.mock('@/lib/whatsapp/team-notify', () => ({ notifyTeamWhatsApp: vi.fn().mockResolvedValue(undefined) }))

beforeEach(() => sendEmailMock.mockClear())

describe('notifyNewLead — Team-Alert an info@ mit Send-Isolation-Optout', () => {
  it('uebergibt allowInternalRecipient:true (sonst wird die info@-Mail live suppressed)', async () => {
    const { notifyNewLead } = await import('../notify-new-lead')
    await notifyNewLead({
      leadId: 'lead-123',
      source: 'Mini-Wizard (/schaden-melden)',
      name: 'Lisa Beispiel',
      phone: '+491700000000',
    })
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const arg = sendEmailMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.to).toBe('info@claimondo.de')
    expect(arg.allowInternalRecipient).toBe(true)
    expect(arg.subject).toContain('Neuer Lead aus Mini-Wizard')
  })
})
