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
    expect(subject({ ...base, einmalpasswort: null })).toContain('Claimondo')
  })

  it('mit Einmalpasswort: enthält Passwort + Magic-Link + Login-URL', async () => {
    const html = await render(WillkommenWerkstattEmail({ ...base, einmalpasswort: 'GeheimA1!' }))
    expect(html).toContain('GeheimA1!')
    expect(html).toContain(base.magicLink)
    expect(html).toContain(base.loginUrl)
    expect(html).toContain('Müller')
  })

  it('ohne Einmalpasswort: kein Passwort-Wert, aber Hinweis auf bestehendes Passwort', async () => {
    const html = await render(WillkommenWerkstattEmail({ ...base, einmalpasswort: null }))
    expect(html).toContain(base.magicLink)
    expect(html).toContain('bestehende')
  })
})
