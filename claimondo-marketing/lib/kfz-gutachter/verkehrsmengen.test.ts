import { describe, expect, it } from 'vitest'
import {
  getVerkehrsmengen, schwerverkehrAnteil, zaehlstelleSatz, type Zaehlstelle,
} from './verkehrsmengen'
import { STAEDTE } from './staedte'

const zs = (p: Partial<Zaehlstelle> = {}): Zaehlstelle => ({
  strasse: 'A3',
  name: 'Leverkusen',
  entfernungKm: 3.2,
  fahrzeugeProTag: 171135,
  schwerverkehrProTag: 20500,
  ...p,
})

describe('getVerkehrsmengen', () => {
  it('liefert für Köln Zählstellen mit plausiblen Größenordnungen', () => {
    const d = getVerkehrsmengen('koeln')!
    expect(d.zaehlstellen.length).toBeGreaterThan(0)
    expect(d.zaehlstellen[0].fahrzeugeProTag).toBeGreaterThan(5000)
    expect(d.jahr).toBeGreaterThanOrEqual(2020)
  })

  it('gibt null für Unbekanntes zurück, statt zu raten', () => {
    expect(getVerkehrsmengen('gibt-es-nicht')).toBeNull()
  })

  it('nennt NIRGENDS 0 Fahrzeuge — das wäre eine falsche Aussage', () => {
    // ⚠ 638 der 2.127 Zählstellen haben kein DTV (Ausfälle). Als 0 gerendert
    // stünde „hier fahren täglich 0 Fahrzeuge" auf einer realen Stadtseite.
    const null_werte: string[] = []
    for (const s of STAEDTE) {
      const d = getVerkehrsmengen(s.slug)
      if (!d) continue
      for (const z of d.zaehlstellen) {
        if (!(z.fahrzeugeProTag > 0)) null_werte.push(`${s.slug}: ${z.strasse} = ${z.fahrzeugeProTag}`)
      }
    }
    expect(null_werte).toEqual([])
  })

  it('hält jede Zählstelle im zugesagten Umkreis', () => {
    const zuWeit: string[] = []
    for (const s of STAEDTE) {
      const d = getVerkehrsmengen(s.slug)
      if (!d) continue
      for (const z of d.zaehlstellen) if (z.entfernungKm > 10) zuWeit.push(`${s.slug}: ${z.entfernungKm} km`)
    }
    expect(zuWeit).toEqual([])
  })

  it('nennt zu jeder Stadt Quelle und Jahr', () => {
    for (const slug of ['koeln', 'berlin', 'dortmund']) {
      const d = getVerkehrsmengen(slug)
      if (!d) continue
      expect(d.quelle).toMatch(/^https:\/\/.*bast\.de/)
      expect(d.lizenz).toMatch(/BASt|Straßenwesen/)
    }
  })

  it('wiederholt dieselbe Straße nicht innerhalb einer Stadt', () => {
    // Zwei Messpunkte derselben Autobahn sagen dem Leser nichts Neues.
    const doppelt: string[] = []
    for (const s of STAEDTE) {
      const d = getVerkehrsmengen(s.slug)
      if (!d || d.zaehlstellen.length < 2) continue
      const strassen = d.zaehlstellen.map((z) => z.strasse)
      if (new Set(strassen).size !== strassen.length) doppelt.push(`${s.slug}: ${strassen.join(', ')}`)
    }
    expect(doppelt).toEqual([])
  })
})

describe('schwerverkehrAnteil', () => {
  it('rechnet den Anteil in Prozent', () => {
    expect(schwerverkehrAnteil(zs({ fahrzeugeProTag: 100000, schwerverkehrProTag: 12000 }))).toBe(12)
  })

  it('gibt null statt 0 %, wenn nicht gesondert gemessen', () => {
    // „0 % Lkw" wäre eine Behauptung; „nicht gemessen" ist die Wahrheit.
    expect(schwerverkehrAnteil(zs({ schwerverkehrProTag: 0 }))).toBeNull()
  })
})

describe('zaehlstelleSatz', () => {
  it('bleibt eine Messung — keine Deutung', () => {
    const satz = zaehlstelleSatz(zs(), 'de-DE')
    expect(satz).toContain('171.135 Fahrzeuge pro Tag')
    expect(satz).toContain('20.500 Lkw und Busse (12 %)')
    expect(satz).not.toMatch(/gefährlich|viel los|deshalb|Stau|Chaos/i)
  })

  it('formatiert nach Locale — hartcodiertes de-DE wäre auf 5 von 6 falsch', () => {
    expect(zaehlstelleSatz(zs(), 'en-US')).toContain('171,135')
    expect(zaehlstelleSatz(zs(), 'de-DE')).toContain('171.135')
  })

  it('lässt den Lkw-Teil weg, wenn nicht gemessen', () => {
    const satz = zaehlstelleSatz(zs({ schwerverkehrProTag: 0 }), 'de-DE')
    expect(satz).toBe('171.135 Fahrzeuge pro Tag.')
    expect(satz).not.toMatch(/Lkw|0 %/)
  })
})
