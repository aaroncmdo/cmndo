import { describe, expect, it } from 'vitest'
import { STAEDTE, getHubCities, getStadtByName, getStadtBySlug } from './staedte'

/** Die Hub-Daten ueber die vorhandene API statt eines neuen Exports. */
const hub = (slug: string) => getHubCities().find((h) => h.slug === slug)!.hyperlocal

describe('getStadtByName', () => {
  it('findet eine Stadt ueber ihren Anzeigenamen', () => {
    expect(getStadtByName('Leverkusen')?.slug).toBe('leverkusen')
    expect(getStadtByName('Köln')?.slug).toBe('koeln')
  })

  it('findet auch mehrteilige Namen', () => {
    expect(getStadtByName('Bergisch Gladbach')?.slug).toBe('bergisch-gladbach')
    expect(getStadtByName('Sankt Augustin')?.slug).toBe('sankt-augustin')
  })

  it('liefert null fuer einen Ort ohne eigene Seite', () => {
    // Roesrath und Wesseling stehen in koelns angrenzendeOrte, haben aber keine
    // Stadtseite. Ein Link dorthin waere eine 404.
    expect(getStadtByName('Rösrath')).toBeNull()
    expect(getStadtByName('Wesseling')).toBeNull()
    expect(getStadtByName('')).toBeNull()
  })

  it('toleriert umgebende Leerzeichen', () => {
    expect(getStadtByName('  Bonn  ')?.slug).toBe('bonn')
  })

  it('matcht exakt und nicht unscharf', () => {
    // Unscharfes Matching wuerde falsche Links erzeugen: 'Monheim' (ohne Zusatz)
    // steht in duesseldorfs angrenzendeOrte und ist NICHT 'Monheim am Rhein'.
    expect(getStadtByName('Koln')).toBeNull()
    expect(getStadtByName('koeln')).toBeNull()
    expect(getStadtByName('Köln-Ehrenfeld')).toBeNull()
  })
})

describe('STAEDTE — Voraussetzungen fuer die Namensauflösung', () => {
  it('hat eindeutige Anzeigenamen', () => {
    // Ohne Eindeutigkeit waere getStadtByName nicht wohldefiniert.
    const doppelt = STAEDTE.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i)
    expect([...new Set(doppelt)]).toEqual([])
  })

  it('hat eindeutige Slugs', () => {
    const doppelt = STAEDTE.map((s) => s.slug).filter((s, i, a) => a.indexOf(s) !== i)
    expect([...new Set(doppelt)]).toEqual([])
  })
})

describe('angrenzendeOrte — welche sind verlinkbar', () => {
  const alleOrte = getHubCities().flatMap((h) => h.hyperlocal.angrenzendeOrte)

  it('sind mehr Orte als verlinkbare — der Rest bleibt bewusst Text', () => {
    const verlinkbar = alleOrte.filter((ort) => getStadtByName(ort) !== null)
    expect(alleOrte.length).toBeGreaterThan(verlinkbar.length)
    expect(verlinkbar.length).toBe(21)
  })

  it('loest jeden verlinkbaren Ort auf eine existierende Seite auf', () => {
    // Der eigentliche Vertrag: kein Link darf ins Leere zeigen.
    const kaputt = alleOrte
      .map((ort) => ({ ort, ziel: getStadtByName(ort) }))
      .filter((x) => x.ziel !== null && getStadtBySlug(x.ziel.slug) === null)
    expect(kaputt).toEqual([])
  })

  it('deckt die Hub->Spoke-Kanten ab, die die Nachbarauswahl nicht zieht', () => {
    // Der Grund, warum A2 keinen eigenen "Auch im Umland"-Block braucht:
    // diese sieben Kanten fehlen der Distanzauswahl und stecken alle in
    // angrenzendeOrte.
    const fehlend = [
      ['duesseldorf', 'Langenfeld'],
      ['duesseldorf', 'Dormagen'],
      ['wuppertal', 'Velbert'],
      ['wuppertal', 'Haan'],
      ['bonn', 'Siegburg'],
      ['bonn', 'Hennef'],
      ['bonn', 'Meckenheim'],
    ] as const
    for (const [hubSlug, ort] of fehlend) {
      expect(hub(hubSlug).angrenzendeOrte).toContain(ort)
      expect(getStadtByName(ort)).not.toBeNull()
    }
  })
})
