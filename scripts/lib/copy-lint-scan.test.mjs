import { describe, it, expect } from 'vitest'
import { scanRdg, scanUmlaute, scanHeadingCode, scanTitleBrandTwice } from './copy-lint-scan.mjs'

describe('scanRdg — RDG-Rollentrennung', () => {
  it('flaggt Erstperson-Rechtsverben (alle am 04.09. live gefundenen Formen)', () => {
    expect(scanRdg('Wir verhandeln vollständige Erstattung.')).toHaveLength(1)
    expect(scanRdg('Wir setzen die Wertminderung nach Sanden/Danner-Formel durch.')).toHaveLength(1)
    expect(scanRdg('Versicherer kürzen trotzdem. Wir holen es zurück.')).toHaveLength(1)
    expect(scanRdg('Wir holen Gutachter- und Anwaltskosten von der Versicherung ein.')).toHaveLength(1)
    expect(scanRdg('Im Streitfall klagen wir vor dem zuständigen Landgericht.')).toHaveLength(1)
    expect(scanRdg('Claimondo holt diese Kürzungen zurück (Quelle: NDR).')).toHaveLength(1)
    expect(scanRdg('Claimondo setzt alle Ansprüche gegen die gegnerische Versicherung durch.')).toHaveLength(1)
    expect(scanRdg('Wenn die Versicherung kürzen will, schreibt unser Anwalt zurück.')).toHaveLength(1)
    expect(scanRdg('Unser Anwalt kennt die versicherungsspezifischen Taktiken.')).toHaveLength(1)
    expect(scanRdg('Wir holen das Maximum für Sie heraus.')).toHaveLength(1)
  })

  it('lässt Partnerkanzlei, Koordination, Kommunikation und Cookie-Sätze durch', () => {
    expect(scanRdg('Unsere Partnerkanzlei verhandelt mit der gegnerischen Versicherung.')).toHaveLength(0)
    expect(scanRdg('Unsere Partnerkanzlei setzt die Wertminderung durch.')).toHaveLength(0)
    expect(scanRdg('Wir koordinieren Gutachter, Anwalt und Werkstatt.')).toHaveLength(0)
    expect(scanRdg('Wir führen die komplette Kommunikation mit der Versicherung.')).toHaveLength(0)
    expect(scanRdg('Cookies setzen wir nur nach Ihrer Einwilligung ein.')).toHaveLength(0)
    expect(scanRdg('Claimondo setzt schmaler an: Haftpflicht-Spezialisierung.')).toHaveLength(0)
    expect(scanRdg('Wir setzen auf Transparenz.')).toHaveLength(0)
    expect(scanRdg('Bei einem wirtschaftlichen Totalschaden holen wir konkrete Angebote aus dem regionalen Markt ein.')).toHaveLength(0)
    expect(scanRdg('Prüfdienst-Kürzungen holt unsere Partnerkanzlei zurück.')).toHaveLength(0)
  })

  it('erkennt Verb-Reihungen nach Komma und den Dativ Plural (B2C-Durchgang 05.09.)', () => {
    expect(scanRdg('Wir disponieren Ihren Gutachter (< 48 h), führen die Versicherungs-Verhandlung und setzen Ihren Anspruch BGH-konform durch.')).toHaveLength(1)
    expect(scanRdg('Wir klären das gemeinsam mit Ihnen und unseren Anwälten.')).toHaveLength(1)
    expect(scanRdg('Wir koordinieren Gutachter, Anwalt und Werkstatt – unsere Partnerkanzlei verhandelt mit der Versicherung.')).toHaveLength(0)
    expect(scanRdg('Ihr unabhängiger Gutachter kommt zu Ihnen, meist in unter 48 Stunden. Gutachten und Anwalt zahlt die gegnerische Versicherung (§ 249 BGB), unsere Partnerkanzlei verhandelt.')).toHaveLength(0)
  })

  it('erkennt nachgestelltes "holen wir … ein" nur mit Geld-/Versicherungsobjekt', () => {
    expect(scanRdg('Gutachterkosten holen wir von der Versicherung ein.')).toHaveLength(1)
    expect(scanRdg('Prüfdienst-Kürzungen (typischerweise 30–40 %) holen wir zurück.')).toHaveLength(1)
  })

  it('bricht das Fenster an Satzgrenzen ab (kein Match über zwei Sätze)', () => {
    expect(scanRdg('Wir setzen auf Transparenz. Die Partnerkanzlei setzt Ansprüche durch.')).toHaveLength(0)
  })
})

describe('scanUmlaute', () => {
  it('findet ASCII-Ersatz nur als ganzes Wort', () => {
    expect(scanUmlaute('Standard-Unfaelle und Komplexe Faelle')).toEqual(['unfaelle', 'faelle'])
    expect(scanUmlaute('Kürzungen zurückholen — schaeden')).toEqual(['schaeden'])
    expect(scanUmlaute('Die Frist beträgt 4 Wochen.')).toEqual([])
    expect(scanUmlaute('/sachverstaendige/bvsk')).toEqual([]) // Slug, kein Wort-Treffer
  })
})

describe('scanHeadingCode', () => {
  it('erkennt die 04.09. live gefundenen Klassen', () => {
    expect(scanHeadingCode('<a name="akut"></a>1. Die ersten 72 Stunden')).toBe(true)
    expect(scanHeadingCode('Verursacher-Hub · 28.750 SV/Mo')).toBe(true)
    expect(scanHeadingCode('ControlExpert &amp; Co.')).toBe(true)
    expect(scanHeadingCode('check.foto_check.heading')).toBe(true)
    expect(scanHeadingCode('Kfz-Gutachter {stadt}')).toBe(true)
  })
  it('lässt normale Überschriften, Domains und Paragraphen durch', () => {
    expect(scanHeadingCode('1. Die ersten 72 Stunden – Sofort-Maßnahmen')).toBe(false)
    expect(scanHeadingCode('Login auf app.claimondo.de')).toBe(false)
    expect(scanHeadingCode('§ 249 Abs. 2 BGB – z. B. UPE')).toBe(false)
    expect(scanHeadingCode('')).toBe(false)
  })
})

describe('scanTitleBrandTwice', () => {
  it('erkennt die doppelte Marke', () => {
    expect(scanTitleBrandTwice('Täglich 3 × 50 € Gutschein gewinnen | Claimondo | Claimondo')).toBe(true)
    expect(scanTitleBrandTwice('Täglich 3 × 50 € Gutschein gewinnen | Claimondo')).toBe(false)
    expect(scanTitleBrandTwice(undefined)).toBe(false)
  })
})
