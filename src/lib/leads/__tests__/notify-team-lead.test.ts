import { describe, it, expect, vi, beforeEach } from 'vitest'

// notifyTeamWhatsApp mocken — der echte Pfad wuerde eine WhatsApp senden.
// Signatur explizit typisiert: ohne Parameter waere der Mock 0-stellig und
// jeder sendMock(text)-Aufruf ein TS2554.
const sendMock = vi.fn(async (_text: string): Promise<void> => {})
vi.mock('@/lib/whatsapp/team-notify', () => ({
  notifyTeamWhatsApp: (text: string) => sendMock(text),
}))

const { notifyTeamNeuerLead } = await import('../notify-team-lead')

/** Der an notifyTeamWhatsApp uebergebene Text des letzten Aufrufs. */
function letzterText(): string {
  const calls = sendMock.mock.calls
  return calls.length > 0 ? calls[calls.length - 1][0] : ''
}

describe('notifyTeamNeuerLead', () => {
  beforeEach(() => sendMock.mockClear())

  it('baut den Default-Link auf den Lead', async () => {
    await notifyTeamNeuerLead({ leadId: 'lead-1', quelle: 'Werkstatt-Finder' })
    expect(letzterText()).toContain('/dispatch/leads/lead-1')
  })

  it('linkPfad ersetzt den Lead-Link (direct-claim zeigt auf die Fallakte)', async () => {
    await notifyTeamNeuerLead({ leadId: 'lead-1', quelle: 'Kunde-Portal', linkPfad: '/faelle/fall-9' })
    const text = letzterText()
    expect(text).toContain('/faelle/fall-9')
    expect(text).not.toContain('/dispatch/leads/lead-1')
  })

  it('ohne leadId und ohne linkPfad steht kein Link im Text', async () => {
    await notifyTeamNeuerLead({ leadId: null, quelle: 'Irgendwas' })
    expect(letzterText()).not.toContain('http')
  })

  it('markiert interne Anlagen unterscheidbar', async () => {
    await notifyTeamNeuerLead({ leadId: 'l', quelle: 'Dispatch', intern: true })
    expect(letzterText()).toContain('intern')
    await notifyTeamNeuerLead({ leadId: 'l', quelle: 'Werkstatt-Finder' })
    expect(letzterText()).not.toContain('intern')
  })

  it('laesst leere Felder weg statt leere Zeilen zu erzeugen', async () => {
    await notifyTeamNeuerLead({
      leadId: 'l',
      quelle: 'Q',
      name: '',
      telefon: null,
      email: undefined,
      zusatz: [null, undefined],
    })
    const text = letzterText()
    expect(text).not.toContain('👤')
    expect(text).not.toContain('📞')
    expect(text).not.toContain('✉️')
  })

  it('wirft nie — ein Sende-Fehler darf die Lead-Anlage nicht brechen', async () => {
    sendMock.mockRejectedValueOnce(new Error('Baileys down'))
    await expect(notifyTeamNeuerLead({ leadId: 'l', quelle: 'Q' })).resolves.toBeUndefined()
  })
})
