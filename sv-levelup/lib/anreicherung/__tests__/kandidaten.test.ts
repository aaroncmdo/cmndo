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
})
