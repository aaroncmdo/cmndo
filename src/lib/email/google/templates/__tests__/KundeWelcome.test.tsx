import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { KundeWelcomeEmail } from '../KundeWelcome'

const base = {
  vorname: 'Max',
  fallNummer: 'CL-2026-0001',
  unfallDatum: '01.07.2026',
  adresse: 'Teststr. 1, 50667 Köln',
  fahrzeug: 'VW Golf',
  versicherung: 'HUK-Coburg',
  svName: null,
  accountExists: false,
  locale: 'de',
  loginInfo: { magicLink: null, email: 'max@example.com', password: 'Secret123!' },
}

// Distinktiver Kern des de-Hinweises — eindeutig, nicht Teil anderer Strings.
const HINT = 'mit Ihrer Telefonnummer anmelden'

describe('KundeWelcomeEmail — Telefon-Login-Hinweis', () => {
  it('zeigt den Hinweis wenn phoneLoginAktiviert=true', async () => {
    const html = await render(
      KundeWelcomeEmail({ ...base, loginInfo: { ...base.loginInfo, phoneLoginAktiviert: true } }),
    )
    expect(html).toContain(HINT)
  })

  it('zeigt den Hinweis NICHT ohne phoneLoginAktiviert', async () => {
    const html = await render(KundeWelcomeEmail(base))
    expect(html).not.toContain(HINT)
  })
})
