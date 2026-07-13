// Render-Guard fuer die branded Passwort-Reset-Mail.
//
// Die Mail loest den Supabase-Built-in-Mailer ab (generisches Template, Rate-Limit,
// Spam bei Firmen-Domains). Der Reset-Link ist der EINZIGE Weg zurueck ins Konto —
// faellt er aus dem Template (oder aus dem Plain-Text-Teil), ist der Reset tot, ohne
// dass Build/tsc etwas merken.

import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { PasswortResetEmail, subject } from '../templates/PasswortReset'
import { htmlToPlainText } from '../../plain-text'

const ACTION_URL =
  'https://app.claimondo.de/api/auth/confirm?token_hash=abc123&type=recovery&next=%2Fpasswort-zuruecksetzen'

describe('PasswortReset-Template', () => {
  it('rendert und traegt den Reset-Link im HTML UND im Plain-Text-Fallback', async () => {
    const html = await render(PasswortResetEmail({ vorname: 'Aaron', actionUrl: ACTION_URL }))
    expect(html).toContain(ACTION_URL)
    // P4: jede Mail geht multipart raus — der Link muss auch im text/plain-Teil ankommen.
    const text = htmlToPlainText(html)
    expect(text).toContain('/api/auth/confirm')
  })

  it('personalisiert die Anrede, faellt ohne Vorname neutral zurueck', async () => {
    const mitName = await render(PasswortResetEmail({ vorname: 'Aaron', actionUrl: ACTION_URL }))
    expect(mitName).toContain('Hallo Aaron')
    const ohneName = await render(PasswortResetEmail({ vorname: null, actionUrl: ACTION_URL }))
    expect(ohneName).toContain('Hallo,')
  })

  it('echte Umlaute im Klartext, kein Entity-Leak', async () => {
    const html = await render(PasswortResetEmail({ vorname: null, actionUrl: ACTION_URL }))
    const text = htmlToPlainText(html)
    expect(text).toContain('gültig')
    expect(text).toContain('unverändert')
    expect(text).not.toContain('&uuml;')
  })

  it('nennt den Sicherheitshinweis (nicht angefordert -> ignorieren)', async () => {
    const html = await render(PasswortResetEmail({ vorname: null, actionUrl: ACTION_URL }))
    const text = htmlToPlainText(html)
    expect(text).toContain('kein neues Passwort angefordert')
  })

  it('setzt einen Betreff', () => {
    expect(subject({ vorname: 'Aaron', actionUrl: ACTION_URL })).toContain('Passwort')
  })
})
