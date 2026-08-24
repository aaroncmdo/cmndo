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

  /**
   * Echter Fall aus dem scharfen Lauf (18.08., sv-bergk.de):
   * "Geschäftsführer: Herr Patrick Brandenburg" ergab vorname="Herr",
   * nachname="Patrick" — der echte Nachname ging verloren. Eine Kaltmail haette
   * "Sehr geehrter Herr Patrick" geschrieben, was jede Ansprache sofort als
   * automatisiert entlarvt.
   */
  it('ueberliest die Anrede vor dem Namen', () => {
    expect(extrahiere('<p>Geschäftsführer: Herr Patrick Brandenburg</p>').person)
      .toBe('Patrick Brandenburg')
    expect(extrahiere('<p>Inhaberin: Frau Sabine Kunz</p>').person).toBe('Sabine Kunz')
    expect(extrahiere('<p>vertreten durch Herrn Dr. Jens Ahlers</p>').person).toBe('Jens Ahlers')
  })

  /** Auffangschutz: bleibt nach dem Abziehen eine Anrede stehen, ist es kein Name. */
  it('verwirft einen Namen, der nur aus Anrede und Titel besteht', () => {
    expect(extrahiere('<p>Inhaber: Herr Dr.</p>').person).toBeNull()
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

  /**
   * Echter Fall aus dem scharfen Lauf (18.08., sv-rommerskirchen.de): die Seite
   * kodiert die Adresse als HTML-Entities gegen Spam-Ernter. Ungedeutet landete
   * die Zeichenfolge `&#105;&#x6e;&#102;…` als "E-Mail" in der Datenbank — sie
   * sah gefuellt aus und war unbrauchbar.
   */
  it('dekodiert HTML-Entities in einer mailto-Adresse', () => {
    const html = '<a href="mailto:&#105;&#x6e;&#102;&#x6f;&#64;&#x73;&#118;&#x2e;&#x64;&#101;">M</a>'
    expect(extrahiere(html).email).toBe('info@sv.de')
  })

  it('dekodiert Entities auch im Fliesstext', () => {
    expect(extrahiere('<p>kontakt&#64;musterwerk&#46;de</p>').email).toBe('kontakt@musterwerk.de')
  })

  /**
   * Der Auffangschutz fuer alles, was hier nicht vorhergesehen ist
   * (JavaScript-Zusammenbau, CSS-Umkehr, Unicode-Tricks): sieht das Ergebnis
   * nicht wie eine Adresse aus, gibt es KEINE Adresse. R-B — lieber kein Wert
   * als ein falscher, der gefuellt aussieht.
   */
  it('verwirft alles, was nach der Deutung keine Adresse ist', () => {
    expect(extrahiere('<a href="mailto:&#105;&#x6e;&#102;">M</a>').email).toBeNull()
    expect(extrahiere('<a href="mailto:kein-at-zeichen.de">M</a>').email).toBeNull()
    expect(extrahiere('<a href="mailto:a@b">M</a>').email).toBeNull()          // keine TLD
    expect(extrahiere('<a href="mailto:a b@c.de">M</a>').email).toBeNull()     // Leerzeichen
    expect(extrahiere('<a href="mailto:info@firmaXde">M</a>').email).toBeNull() // Punkt fehlt
  })

  it('akzeptiert Subdomains und Bindestrich-Domains', () => {
    expect(extrahiere('<a href="mailto:a@mail.sv-buero.de">M</a>').email).toBe('a@mail.sv-buero.de')
  })

  it('behandelt &amp; im Umfeld, ohne die Adresse zu zerstoeren', () => {
    expect(extrahiere('<p>Meyer &amp; Sohn: buero@meyer-sohn.de</p>').email)
      .toBe('buero@meyer-sohn.de')
  })
})
