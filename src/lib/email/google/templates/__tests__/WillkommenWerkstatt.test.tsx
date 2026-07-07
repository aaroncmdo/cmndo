import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { WillkommenWerkstattEmail, subject } from '../WillkommenWerkstatt'

const base = {
  werkstattName: 'Auto-Service Müller GmbH',
  email: 'werkstatt@example.com',
  loginUrl: 'https://app.claimondo.de/login',
  magicLink: 'https://app.claimondo.de/passwort-zuruecksetzen?token=abc',
}

describe('WillkommenWerkstattEmail', () => {
  it('subject nennt Claimondo', () => {
    expect(subject(base)).toContain('Claimondo')
  })

  it('Magic-Link-only: enthält Recovery-Link, Login-URL und Werkstattname (kein Passwort-Feld)', async () => {
    const html = await render(WillkommenWerkstattEmail(base))
    expect(html).toContain(base.magicLink)
    expect(html).toContain(base.loginUrl)
    expect(html).toContain('Müller')
    expect(html).toContain('Passwort setzen') // Button-Text "Passwort setzen & einloggen"
  })
})
