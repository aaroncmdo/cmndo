import { describe, it, expect } from 'vitest'
import { buildKundeZugangWhatsAppText } from '../kunde-zugang-text'

const LOGIN = 'https://app.claimondo.de/login'
const MAGIC = 'https://app.claimondo.de/api/auth/confirm?token_hash=abc123&type=magiclink&next=%2Fkunde%2Fonboarding'

describe('buildKundeZugangWhatsAppText', () => {
  it('mit Magic-Link: Link drin, KEIN Klartext-Passwort-Feld, Anrede Sie (kein Du)', () => {
    const t = buildKundeZugangWhatsAppText({ magicLink: MAGIC, loginUrl: LOGIN })
    expect(t).toContain('token_hash=abc123')
    expect(t).not.toMatch(/passwort:/i) // die alte "Passwort: <wert>"-Leak-Form
    expect(t).toContain('Sie')
    expect(t).not.toMatch(/\b(du|dein|deine|dich|dir|ändere)\b/i) // kein Du/Sie-Mix
  })

  it('Fallback ohne Magic-Link: Login-URL, KEIN Klartext-Passwort-Feld, Anrede Sie (kein Du)', () => {
    const t = buildKundeZugangWhatsAppText({ magicLink: null, loginUrl: LOGIN })
    expect(t).toContain(LOGIN)
    expect(t).not.toMatch(/passwort:/i)
    expect(t).toContain('Sie')
    expect(t).not.toMatch(/\b(du|dein|deine|dich|dir|ändere)\b/i)
  })

  it('nimmt strukturell KEIN Passwort entgegen (Leak unmoeglich)', () => {
    // Der Builder hat keinen password-Parameter — es gibt nichts zu leaken.
    const t = buildKundeZugangWhatsAppText({ magicLink: null, loginUrl: LOGIN })
    expect(t.toLowerCase()).not.toContain('passwort:')
  })
})
