import { describe, expect, it } from 'vitest'
import { kernName } from '../kern-name'
import { domainKandidaten } from '../domain-kandidaten'

describe('kernName', () => {
  it('entfernt Gattungswoerter und Rechtsform', () => {
    expect(kernName('Kfz-Sachverständigenbüro Musterwerk GmbH')).toBe('musterwerk')
    expect(kernName('SV-Büro Musterwerk')).toBe('musterwerk')
    expect(kernName('Ingenieurbüro Schmitz')).toBe('schmitz')
  })

  it('loest Umlaute auf', () => {
    expect(kernName('Gutachter Müller & Söhne')).toBe('mueller soehne')
  })

  it('behaelt mehrteilige Eigennamen', () => {
    expect(kernName('Kfz-Gutachter Meyer und Partner')).toBe('meyer partner')
  })

  it('gibt bei reinem Gattungsnamen einen leeren Kern zurueck', () => {
    // Nichts zu raten — der Aufrufer muss das als "kein Kandidat" behandeln (R-B)
    expect(kernName('Kfz-Sachverständigenbüro')).toBe('')
  })

  /**
   * Am echten Bestand gemessen (18.08., Trockenlauf ueber die 62 Excel-Leads):
   * ohne diese Streichungen wurde der Domain-Kern aus einer Abkuerzung gebildet
   * — "Ing.-Büro Urbach KG" ergab den Kandidaten `sv-ing.de`, eine FREMDE Firma,
   * unter deren Impressum eine fremde Telefonnummer stand.
   */
  it('streicht die Abkuerzung "Ing." — sie ist ein Gattungswort', () => {
    expect(kernName('Ing.-Büro Urbach KG')).toBe('urbach')
  })

  it('streicht Fuellwoerter und "Inh."', () => {
    expect(kernName('Sachverständigenbüro für Fahrzeugtechnik Inh. Harald Lange'))
      .toBe('harald lange')
  })

  it('streicht Taetigkeitsbegriffe, die keine Eigennamen sind', () => {
    expect(kernName('Kfz-Prüfstelle Fahrzeugbewertung Dornbach')).toBe('dornbach')
    expect(kernName('Dipl.-Ing. Kessel Schadengutachten')).toBe('kessel')
  })
})

describe('domainKandidaten', () => {
  it('liefert hoechstens 5 Kandidaten', () => {
    expect(domainKandidaten('Kfz-Sachverständigenbüro Musterwerk GmbH', 'Münster').length)
      .toBeLessThanOrEqual(5)
  })

  it('setzt die direkte Domain nach vorn', () => {
    expect(domainKandidaten('Sachverständigenbüro Musterwerk', 'Münster')[0]).toBe('musterwerk.de')
  })

  it('bildet Praefix- und Ort-Varianten', () => {
    const k = domainKandidaten('Sachverständigenbüro Musterwerk', 'Münster')
    expect(k).toContain('sv-musterwerk.de')
    expect(k).toContain('musterwerk-muenster.de')
  })

  it('gibt bei leerem Kern KEINE Kandidaten zurueck, statt zu raten', () => {
    expect(domainKandidaten('Kfz-Sachverständigenbüro', 'Münster')).toEqual([])
  })

  it('macht aus mehrteiligen Kernen eine zusammengezogene Domain', () => {
    expect(domainKandidaten('Gutachter Meyer und Partner', null)).toContain('meyerpartner.de')
  })

  it('erzeugt keine Duplikate', () => {
    const k = domainKandidaten('Sachverständigenbüro Musterwerk', 'Münster')
    expect(new Set(k).size).toBe(k.length)
  })

  /**
   * Bei "Inh. Harald Lange" ist der Nachname das LETZTE Kernwort. Wer nur das
   * erste nimmt, raet `harald.de` und verpasst `sv-lange.de`. Beim Bestand ist
   * der Personenname der haeufigste Domain-Kern.
   */
  it('bildet auch aus dem letzten Kernwort Kandidaten', () => {
    const k = domainKandidaten('Sachverständigenbüro Inh. Harald Lange', null)
    expect(k).toContain('lange.de')
    expect(k).toContain('sv-lange.de')
  })

  it('haelt die Obergrenze von 5 auch bei mehrteiligen Kernen', () => {
    expect(domainKandidaten('Gutachter Andreas Wettstein Rommerskirchen', 'Köln').length)
      .toBeLessThanOrEqual(5)
  })
})
