import { describe, expect, it } from 'vitest'
import { extrahiere } from '../impressum'
import { zuE164 } from '../telefon-e164'

describe('zuE164', () => {
  it('normalisiert deutsche Schreibweisen', () => {
    expect(zuE164('0251 / 12 34 56')).toBe('+49251123456')
    expect(zuE164('+49 (0)251 123456')).toBe('+49251123456')
    expect(zuE164('0049 251 123456')).toBe('+49251123456')
  })

  it('verwirft zu kurze Nummern statt zu raten', () => {
    expect(zuE164('12345')).toBeNull()
    expect(zuE164('')).toBeNull()
  })

  it('laesst eine auslaendische Nummer mit Landesvorwahl stehen', () => {
    expect(zuE164('+43 1 2345678')).toBe('+4312345678')
  })

  it('verwirft absurd lange Ziffernfolgen', () => {
    expect(zuE164('0251' + '1'.repeat(20))).toBeNull()
  })
})

describe('extrahiere', () => {
  it('liest eine mailto-Adresse', () => {
    const r = extrahiere('<a href="mailto:kanzlei@musterwerk.de">Mail</a>')
    expect(r.email).toBe('kanzlei@musterwerk.de')
    expect(r.istRollenadresse).toBe(true) // kanzlei@ ist eine Rollenadresse
  })

  it('erkennt eine persoenliche Adresse als solche', () => {
    expect(extrahiere('<a href="mailto:k.meyer@musterwerk.de">M</a>').istRollenadresse).toBe(false)
  })

  it('markiert Rollenadressen', () => {
    expect(extrahiere('info@musterwerk.de').istRollenadresse).toBe(true)
    expect(extrahiere('kontakt@musterwerk.de').istRollenadresse).toBe(true)
  })

  it('entobfuskiert (at) und [at]', () => {
    expect(extrahiere('mail (at) musterwerk.de').email).toBe('mail@musterwerk.de')
    expect(extrahiere('mail[at]musterwerk[dot]de').email).toBe('mail@musterwerk.de')
  })

  it('schreibt die Adresse klein', () => {
    expect(extrahiere('Info@Musterwerk.DE').email).toBe('info@musterwerk.de')
  })

  it('liest die vertretungsberechtigte Person', () => {
    expect(extrahiere('<p>Inhaber: Dipl.-Ing. Klaus Meyer</p>').person).toBe('Klaus Meyer')
    expect(extrahiere('vertreten durch Anna Schmitz').person).toBe('Anna Schmitz')
    expect(extrahiere('Geschäftsführerin: Petra Lang').person).toBe('Petra Lang')
  })

  it('liest eine Telefonnummer', () => {
    expect(extrahiere('<p>Telefon: 0251 / 123456</p>').telefon).toBe('+49251123456')
  })

  it('gibt null zurueck, wenn nichts steht — kein Raten', () => {
    const r = extrahiere('<p>Willkommen auf unserer Seite.</p>')
    expect(r.email).toBeNull()
    expect(r.telefon).toBeNull()
    expect(r.person).toBeNull()
  })

  it('ignoriert Bild- und Skript-Adressen', () => {
    expect(extrahiere('<img src="logo@2x.png"> <script>a@b.c</script>').email).toBeNull()
  })

  it('verwirft eine Bilddatei, die als Text im Fliesstext steht', () => {
    expect(extrahiere('<p>siehe logo@2x.png</p>').email).toBeNull()
  })
})
