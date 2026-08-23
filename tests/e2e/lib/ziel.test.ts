import { describe, expect, it } from 'vitest'
import { brauchtBasicAuth, credentialsAus } from './ziel'

// Diese Tests bewachen die Fehlerklasse, die am 23.08. DREIMAL an einem Tag zuschlug:
// eine Bedingung haengt an einem Stellvertreter (`CI`, `IS_LOCAL`) statt am ZIEL.
// In CI stimmen Stellvertreter und Ziel zufaellig ueberein — die Divergenz entsteht
// erst lokal, also genau dort, wo der Regel-4-Lauf gefahren wird.

describe('brauchtBasicAuth', () => {
  it('erkennt staging als Basic-Auth-pflichtig', () => {
    expect(brauchtBasicAuth('https://app.staging.claimondo.de')).toBe(true)
  })

  it('behandelt prod NICHT wie staging', () => {
    // Genau der Bug aus #5543: `!IS_LOCAL` war true fuer prod, also skippte der
    // Prod-Lauf still — der Lauf, den Regel 4 vorschreibt.
    expect(brauchtBasicAuth('https://app.claimondo.de')).toBe(false)
  })

  it('behandelt localhost NICHT wie staging', () => {
    expect(brauchtBasicAuth('http://localhost:3000')).toBe(false)
  })

  it('erkennt staging auch in abweichender Schreibweise', () => {
    expect(brauchtBasicAuth('https://STAGING.claimondo.de')).toBe(true)
  })
})

describe('credentialsAus', () => {
  it('akzeptiert das Namenspaar STAGING_BASIC_AUTH_*', () => {
    expect(credentialsAus({ STAGING_BASIC_AUTH_USER: 'a', STAGING_BASIC_AUTH_PASS: 'b' })).toEqual({
      username: 'a',
      password: 'b',
    })
  })

  it('akzeptiert das Namenspaar STAGING_BASIC_*', () => {
    expect(credentialsAus({ STAGING_BASIC_USER: 'c', STAGING_BASIC_PASS: 'd' })).toEqual({
      username: 'c',
      password: 'd',
    })
  })

  it('liefert undefined bei leerem Passwort statt eines kaputten Kontexts', () => {
    // Klasse aus #5465: ein gesetztes-aber-leeres CI-Secret rendert als ''.
    // Mit `??` ginge es als gueltiger Wert durch und nginx antwortete 401 —
    // das saehe aus wie ein kaputtes Deployment statt wie ein fehlendes Secret.
    expect(credentialsAus({ STAGING_BASIC_AUTH_USER: 'a', STAGING_BASIC_AUTH_PASS: '' })).toBeUndefined()
  })

  it('liefert undefined, wenn gar nichts gesetzt ist', () => {
    expect(credentialsAus({})).toBeUndefined()
  })
})
