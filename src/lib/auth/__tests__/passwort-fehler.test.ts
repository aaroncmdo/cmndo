import { describe, expect, it } from 'vitest'
import { istUnbekannterPasswortFehler, uebersetzePasswortFehler } from '../passwort-fehler'

describe('uebersetzePasswortFehler', () => {
  it('uebersetzt Supabases HIBP-Meldung — der Fall vom 23.08.', () => {
    // ⚠ Das ist die Meldung, die den Sachverstaendigen aussperrte. Supabase
    // prueft SELBST gegen Have-I-Been-Pwned und antwortet auf Englisch.
    const t = uebersetzePasswortFehler(
      'Password is known to be weak and easy to guess, please choose a different one.',
    )
    expect(t).toContain('Daten-Leaks')
    expect(t).toContain('anderes')
  })

  it('erkennt die HIBP-Klasse auch in anderen Formulierungen', () => {
    for (const roh of ['password found in a data breach', 'this password has been pwned', 'leaked password']) {
      expect(uebersetzePasswortFehler(roh)).toContain('Daten-Leaks')
    }
  })

  it('trennt "zu kurz" von "zu schwach" — verschiedene Handlungsanweisungen', () => {
    // ⚠ "weak" UND "short" in einer Meldung: der Nutzer soll erfahren, dass
    // Laenge das Problem ist, nicht die Qualitaet.
    expect(uebersetzePasswortFehler('Password should be at least 6 characters')).toContain('zu kurz')
    expect(uebersetzePasswortFehler('Password is too short and weak')).toContain('zu kurz')
  })

  it('nennt beim Wiederverwenden des alten Passworts den echten Grund', () => {
    expect(
      uebersetzePasswortFehler('New password should be different from the old password.'),
    ).toContain('unterscheiden')
  })

  it('rät bei abgelaufener Sitzung zum neuen Link — nicht nur "Fehler"', () => {
    // ⚠ Ein verbrauchter Magic-Link erzeugt genau das. "Bitte erneut versuchen"
    // waere hier eine Sackgasse: derselbe Link wird nie wieder funktionieren.
    const t = uebersetzePasswortFehler('Auth session missing!')
    expect(t).toContain('Link erneut anfordern')
  })

  it('erkennt Supabases Rate-Limit-Formulierung', () => {
    expect(
      uebersetzePasswortFehler('For security purposes, you can only request this after 51 seconds.'),
    ).toContain('Zu viele Versuche')
  })

  it('reicht unbekannte englische Meldungen NICHT durch', () => {
    // ⭐ Der Kern des Fixes: lieber ein allgemeiner deutscher Satz als eine
    // englische Bibliotheksmeldung, die wie ein Absturz aussieht.
    const t = uebersetzePasswortFehler('unexpected_failure: database connection reset')
    expect(t).not.toContain('database')
    expect(t).not.toContain('unexpected')
    expect(t).toBe('Das Passwort konnte nicht gesetzt werden. Bitte erneut versuchen.')
  })

  it('kommt mit null/leer zurecht', () => {
    expect(uebersetzePasswortFehler(null)).toBeTruthy()
    expect(uebersetzePasswortFehler(undefined)).toBeTruthy()
    expect(uebersetzePasswortFehler('')).toBeTruthy()
  })

  it('antwortet immer auf Deutsch — keine Regel gibt Englisches zurueck', () => {
    const proben = [
      'Password is known to be weak',
      'New password should be different from the old password.',
      'Password should be at least 6 characters',
      'Auth session missing!',
      'For security purposes, you can only request this after 51 seconds.',
      'User not found',
      'irgendein voellig unbekannter fehler',
    ]
    for (const p of proben) {
      const t = uebersetzePasswortFehler(p)
      expect(t).toMatch(/[a-zäöüß]/i)
      // Kein englisches Kernwort darf durchrutschen.
      expect(t.toLowerCase()).not.toMatch(/\b(password|error|failed|invalid)\b/)
    }
  })
})

describe('istUnbekannterPasswortFehler', () => {
  it('meldet bekannte Klassen als bekannt', () => {
    expect(istUnbekannterPasswortFehler('Password is known to be weak')).toBe(false)
    expect(istUnbekannterPasswortFehler('Auth session missing!')).toBe(false)
  })

  it('meldet Unbekanntes als unbekannt — damit es geloggt und hier ergaenzt wird', () => {
    expect(istUnbekannterPasswortFehler('unexpected_failure: connection reset')).toBe(true)
  })
})
