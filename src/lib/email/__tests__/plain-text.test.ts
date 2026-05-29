import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { htmlToPlainText } from '../plain-text'
import TwoFactorCodeEmail from '../google/templates/TwoFactorCode'
import LeadReminder1 from '../google/templates/LeadReminder1'

describe('htmlToPlainText', () => {
  it('gibt bei leerem/fehlendem HTML einen leeren String zurueck (nie throw)', () => {
    expect(htmlToPlainText('')).toBe('')
    expect(htmlToPlainText(null)).toBe('')
    expect(htmlToPlainText(undefined)).toBe('')
  })

  it('entfernt Tags und behaelt Umlaute', () => {
    const out = htmlToPlainText('<p>Gr&uuml;&szlig;e aus K&ouml;ln &mdash; &Auml;nderung n&ouml;tig</p>')
    expect(out).toContain('Grüße aus Köln')
    expect(out).toContain('Änderung nötig')
    expect(out).not.toMatch(/<\/?[a-z]/i)
    expect(out).not.toContain('&uuml;')
  })

  it('skippt Bilder (kein [image]-Platzhalter, keine src-URL)', () => {
    const out = htmlToPlainText('<p>Text</p><img src="https://x/logo.png" alt="Logo">')
    expect(out).toContain('Text')
    expect(out).not.toContain('logo.png')
  })

  it('skippt Preheader-Padding via [data-skip-in-text=true]', () => {
    const out = htmlToPlainText(
      '<span>Vorschau</span><span data-skip-in-text="true"> ‌ ‌ ‌ ‌</span><p>Inhalt</p>',
    )
    expect(out).toContain('Vorschau')
    expect(out).toContain('Inhalt')
    // kein langer Lauf aus geschuetzten Leerzeichen aus dem Padding
    expect(out).not.toMatch(/ {3,}/)
  })

  it('zeigt die Link-URL, wenn sie vom Linktext abweicht', () => {
    const out = htmlToPlainText('<a href="https://app.claimondo.de/kunde">Zum Portal</a>')
    expect(out).toContain('Zum Portal')
    expect(out).toContain('https://app.claimondo.de/kunde')
  })

  it('dupliziert die URL nicht, wenn Linktext == href', () => {
    const out = htmlToPlainText('<a href="https://claimondo.de">https://claimondo.de</a>')
    expect(out.match(/https:\/\/claimondo\.de/g)?.length).toBe(1)
  })
})

describe('htmlToPlainText end-to-end (echte Templates)', () => {
  it('TwoFactorCode (Tier-3): Code im Text, kein HTML/VML-Leak', async () => {
    const html = await render(TwoFactorCodeEmail({ vorname: 'Max', code: '482913', gueltigMinuten: 5 }))
    const text = htmlToPlainText(html)
    expect(text).toContain('482913')
    expect(text).toContain('Login-Code')
    expect(text).toContain('Sicherheitshinweis')
    expect(text).not.toMatch(/<\/?[a-z]/i)
    expect(text.toLowerCase()).not.toContain('roundrect')
  })

  it('LeadReminder1 (Tier-1, Button+Hero): CTA-URL im Text, keine VML/mso-Reste', async () => {
    const url = 'https://app.claimondo.de/schaden-melden/fortsetzen/abc123'
    const html = await render(LeadReminder1({ vorname: 'Max', resumeUrl: url }))
    const text = htmlToPlainText(html)
    expect(text).toContain('Weitermachen')
    expect(text).toContain(url)
    expect(text).not.toMatch(/<\/?[a-z]/i)
    expect(text.toLowerCase()).not.toContain('roundrect')
    expect(text.toLowerCase()).not.toContain('fillcolor')
  })
})
