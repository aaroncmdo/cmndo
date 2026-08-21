import { describe, expect, it } from 'vitest'
import { getUnfallhotspots, hotspotOrt, hotspotSatz, type Unfallhotspot } from './unfallhotspots'
import { STAEDTE } from './staedte'

const hs = (p: Partial<Unfallhotspot> = {}): Unfallhotspot => ({
  strasse: 'Hohenstaufenring',
  stadtteil: 'Neustadt',
  unfaelle: 64,
  schwerverletzte: 0,
  getoetete: 0,
  lat: 50.93106,
  lng: 6.94066,
  ...p,
})

describe('getUnfallhotspots', () => {
  it('liefert für Köln echte Häufungen mit plausiblen Größenordnungen', () => {
    const d = getUnfallhotspots('koeln')!
    expect(d.hotspots.length).toBeGreaterThan(0)
    expect(d.hotspots[0].unfaelle).toBeGreaterThanOrEqual(10)
    expect(d.zeitraum).toMatch(/^\d{4}–\d{4}$/)
  })

  it('gibt null für Unbekanntes zurück, statt zu raten', () => {
    expect(getUnfallhotspots('gibt-es-nicht')).toBeNull()
  })

  it('kennt nur Städte, die wir auch führen', () => {
    // Ein Slug in den Daten, den es als Seite nicht gibt, wäre ein
    // Zuordnungsfehler im Generator — und würde nie auffallen, weil die
    // Sektion einfach nirgends erschiene.
    const bekannt = new Set(STAEDTE.map((s) => s.slug))
    const daten = ['koeln', 'bremen', 'dresden', 'huerth'].filter((s) => getUnfallhotspots(s))
    for (const slug of daten) expect(bekannt.has(slug)).toBe(true)
  })

  it('hält jede Angabe über der Schwelle und nennt zu jeder eine Quelle', () => {
    for (const slug of ['koeln', 'bremen', 'hannover', 'dresden']) {
      const d = getUnfallhotspots(slug)
      if (!d) continue
      expect(d.quelle).toMatch(/^https:\/\//)
      expect(d.lizenz).toMatch(/Datenlizenz Deutschland/)
      for (const h of d.hotspots) {
        expect(h.unfaelle).toBeGreaterThanOrEqual(10)
        expect(h.strasse.length).toBeGreaterThan(2)
        // Koordinaten müssen in Deutschland liegen — sonst hat der Generator
        // die falsche Spalte gelesen (die Layouts wechseln je Jahrgang).
        expect(h.lat).toBeGreaterThan(47)
        expect(h.lat).toBeLessThan(55.1)
        expect(h.lng).toBeGreaterThan(5.8)
        expect(h.lng).toBeLessThan(15.1)
      }
    }
  })

  it('nennt keine Hausnummern', () => {
    // Der Cluster ist ein ~100-m-Bereich. Eine Hausnummer wäre präziser als
    // die Daten hergeben und eine Aussage über ein konkretes Grundstück.
    //
    // ⚠ Nicht jede Zahl am Ende ist eine Hausnummer: 28 Häufungen liegen an
    // nummerierten Straßen („A 30", „L 182", „B 16a"). Der erste Anlauf dieses
    // Tests flaggte genau die — ein Regex, der beides nicht unterscheidet,
    // hätte hier einen Fehler behauptet, den es nicht gibt.
    const strassennummer = /^[ABKL]\s*\d+[a-z]?$/i
    const mitNummer: string[] = []
    for (const s of STAEDTE) {
      const d = getUnfallhotspots(s.slug)
      if (!d) continue
      for (const h of d.hotspots) {
        const t = h.strasse.trim()
        if (strassennummer.test(t)) continue
        if (/\d+\s*[a-z]?$/i.test(t)) mitNummer.push(`${s.slug}: ${t}`)
      }
    }
    expect(mitNummer).toEqual([])
  })
})

describe('hotspotOrt', () => {
  it('nennt den Stadtteil, wenn er bekannt ist', () => {
    expect(hotspotOrt(hs())).toBe('Hohenstaufenring (Neustadt)')
  })

  it('lässt die Klammer weg statt „(null)" zu schreiben', () => {
    expect(hotspotOrt(hs({ stadtteil: null }))).toBe('Hohenstaufenring')
  })

  it('schreibt nummerierte Straßen aus — „A 30" allein liest sich wie ein Tippfehler', () => {
    expect(hotspotOrt(hs({ strasse: 'A 30', stadtteil: null }))).toBe('Autobahn A 30')
    expect(hotspotOrt(hs({ strasse: 'B 16a', stadtteil: null }))).toBe('Bundesstraße B 16a')
    expect(hotspotOrt(hs({ strasse: 'L 182', stadtteil: 'Heimerzheim' }))).toBe('Landesstraße L 182 (Heimerzheim)')
    expect(hotspotOrt(hs({ strasse: 'K 9', stadtteil: null }))).toBe('Kreisstraße K 9')
  })

  it('lässt echte Straßennamen unangetastet', () => {
    // Kein gieriges Matching: „Bahnhofstraße" beginnt mit B, ist aber keine
    // Bundesstraße.
    for (const s of ['Bahnhofstraße', 'Aachener Straße', 'Lindenallee', 'Kölner Ring']) {
      expect(hotspotOrt(hs({ strasse: s, stadtteil: null }))).toBe(s)
    }
  })
})

describe('hotspotSatz', () => {
  it('bleibt eine Faktenaussage — keine Wertung, keine Ursache', () => {
    const satz = hotspotSatz(hs(), '2021–2025')
    expect(satz).toBe('2021–2025 wurden hier 64 Unfälle mit Personenschaden erfasst.')
    // Die Formulierungen, die den Quellenzwang überhaupt nötig gemacht haben:
    expect(satz).not.toMatch(/gefährlich|Gefahr|berüchtigt|Vorsicht|riskant|Brennpunkt/i)
  })

  it('nennt Schwerverletzte, wenn es welche gab', () => {
    expect(hotspotSatz(hs({ schwerverletzte: 6 }), '2021–2025')).toContain('6 davon mit Schwerverletzten')
  })

  it('beugt im Singular korrekt', () => {
    expect(hotspotSatz(hs({ schwerverletzte: 1 }), '2021–2025')).toContain('einer davon mit Schwerverletzten')
    expect(hotspotSatz(hs({ getoetete: 1 }), '2021–2025')).toContain('darunter einer mit tödlichem Ausgang')
  })

  it('verschweigt Nullwerte, statt „0 Getötete" zu schreiben', () => {
    const satz = hotspotSatz(hs({ getoetete: 0, schwerverletzte: 0 }), '2021–2025')
    expect(satz).not.toMatch(/0 /)
    expect(satz).not.toMatch(/tödlich/)
  })

  it('trägt echte Umlaute (Frontend-Text)', () => {
    const satz = hotspotSatz(hs({ getoetete: 2 }), '2021–2025')
    expect(satz).toContain('tödlichem')
    expect(satz).not.toMatch(/toedlich|Unfaelle/)
  })
})
