import { describe, expect, it } from 'vitest'
import { bereinigeAuswahl, sperrgrund, vorauswahl, type Kontext } from '../sperrlogik'
import { modulNachId, type ModulId } from '../registry'

const voll: Kontext = {
  modus: 'bestand', hatUrl: true, hatPlacesZugang: true,
  hatAdsKonto: true, hatMetaKonto: true, hatGscFreigabe: true,
}

describe('Sperrlogik', () => {
  it('sperrt ux im Aufbau-Modus', () => {
    expect(sperrgrund(modulNachId('ux')!, { ...voll, modus: 'aufbau' }))
      .toBe('für diesen Weg nicht vorgesehen')
  })

  it('sperrt web ohne URL', () => {
    expect(sperrgrund(modulNachId('web')!, { ...voll, hatUrl: false }))
      .toBe('braucht eine Website-Adresse')
  })

  it('gibt web frei, sobald eine URL vorliegt', () => {
    expect(sperrgrund(modulNachId('web')!, voll)).toBeNull()
  })

  it('sperrt wett ohne Places-Zugang', () => {
    expect(sperrgrund(modulNachId('wett')!, { ...voll, hatPlacesZugang: false }))
      .toBe('Zugang zur Kartensuche fehlt')
  })

  // T-06: der Client ist nicht vertrauenswuerdig
  it('verwirft serverseitig, was der Client trotz Sperre mitschickt', () => {
    const ctx: Kontext = { ...voll, modus: 'aufbau', hatUrl: false }
    const r = bereinigeAuswahl(['web', 'seo', 'gbp', 'wett'], ctx)
    expect(r.akzeptiert).toEqual(['wett'])
    expect(r.verworfen.map((v) => v.id).sort()).toEqual(['gbp', 'seo', 'web'])
  })

  // T-02: der Wunsch bleibt erhalten, die URL bringt die Module zurueck
  it('gibt Module zurueck, wenn die URL nachgetragen wird', () => {
    const wunsch: Parameters<typeof bereinigeAuswahl>[0] = ['web', 'seo', 'wett']
    const ohne = bereinigeAuswahl(wunsch, { ...voll, modus: 'aufbau', hatUrl: false })
    const mit = bereinigeAuswahl(wunsch, { ...voll, modus: 'aufbau', hatUrl: true })
    expect(ohne.akzeptiert).toEqual(['wett'])
    expect([...mit.akzeptiert].sort()).toEqual(['seo', 'web', 'wett'])
  })

  it('rechnet punkteErhebbar aus den akzeptierten Modulen', () => {
    // markt/nische/volumen tragen 0, ads traegt 10 -> T-04 erwartet 10
    const r = bereinigeAuswahl(['markt', 'nische', 'volumen', 'ads'], voll)
    expect(r.punkteErhebbar).toBe(10)
  })

  it('rechnet den Weg-A-Vollumfang auf 80 Punkte', () => {
    // 150 minus gbp(22), web(12), seo(12), ux(12), gsc(12) = 80.
    // gbp/ux/gsc fallen ueber den Modus weg, web/seo ueber die fehlende URL.
    const ctx: Kontext = { ...voll, modus: 'aufbau', hatUrl: false }
    const alle: Parameters<typeof bereinigeAuswahl>[0] =
      ['wett','verz','zuweiser','ads','kwg','kwm','nach','markt','nische','volumen','gebiet']
    expect(bereinigeAuswahl(alle, ctx).punkteErhebbar).toBe(80)
  })

  it('nimmt gsc nicht in die Vorauswahl — es verlangt eine Freigabe', () => {
    expect(vorauswahl(voll)).not.toContain('gsc')
  })

  it('nimmt gebiet nur im Aufbau-Modus in die Vorauswahl', () => {
    expect(vorauswahl({ ...voll, modus: 'aufbau', hatUrl: false })).toContain('gebiet')
    expect(vorauswahl(voll)).not.toContain('gebiet')
  })
})

/**
 * ⚠ DER BEFUND VOM 25.08.2026: `ads` stand in JEDER Modulliste echter Checks
 * und hat nie einen Wert geliefert. Sein `braucht: 'browser'` gibt nie einen
 * Sperrgrund zurueck — die Messung stoesst ein Mensch an —, aber eine
 * Messfunktion existiert nicht. Ergebnis: 10 Punkte, die der Nutzer waehlt und
 * die dann als Fehlstelle aus dem Nenner fallen.
 */
describe('Vorauswahl kennt nur messbare Module', () => {
  const MESSBAR = new Set<ModulId>(['gbp', 'web', 'seo', 'ux', 'ki', 'wett', 'verz', 'zuweiser', 'nach'])

  it('laesst ads weg, solange es keine Messfunktion gibt', () => {
    expect(vorauswahl(voll)).toContain('ads')                    // ohne Filter: drin
    expect(vorauswahl(voll, MESSBAR)).not.toContain('ads')
  })

  it('behaelt die Module, die wirklich messen', () => {
    const v = vorauswahl(voll, MESSBAR)
    for (const id of ['gbp', 'web', 'seo', 'ux', 'ki', 'wett', 'verz', 'zuweiser', 'nach']) {
      expect(v).toContain(id)
    }
  })

  it('behaelt Textbausteine ohne Punktwertung', () => {
    // markt/nische/volumen/ortsseiten tragen 0 Punkte und brauchen keine
    // Messfunktion — sie duerfen nicht mit ads zusammen herausfallen.
    const v = vorauswahl(voll, MESSBAR)
    expect(v).toContain('markt')
    expect(v).toContain('nische')
  })

  it('sperrt weiterhin, was gesperrt gehoert', () => {
    const ohneUrl = vorauswahl({ ...voll, hatUrl: false }, MESSBAR)
    expect(ohneUrl).not.toContain('web')
    expect(ohneUrl).not.toContain('ki')
    expect(ohneUrl).not.toContain('gsc')
  })
})
