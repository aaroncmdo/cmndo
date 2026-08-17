import { describe, expect, it } from 'vitest'
import { finderHrefFuerStadt } from './finder-link'
import { STAEDTE, getStadtBySlug } from './staedte'

const koeln = getStadtBySlug('koeln')!
const bergisch = getStadtBySlug('bergisch-gladbach')!
const muenchen = getStadtBySlug('muenchen')!

describe('finderHrefFuerStadt', () => {
  it('zeigt auf den Finder', () => {
    expect(finderHrefFuerStadt(koeln)).toMatch(/^\/gutachter-finden\?/)
  })

  it('uebergibt die gepflegten Koordinaten', () => {
    const p = new URL(finderHrefFuerStadt(koeln), 'https://claimondo.de').searchParams
    expect(Number(p.get('lat'))).toBe(koeln.lat)
    expect(Number(p.get('lng'))).toBe(koeln.lng)
  })

  it('kodiert Umlaute im Stadtnamen korrekt', () => {
    // Roh eingesetzt waere "München" in der URL kaputt — und der Fallback-Pfad
    // der Finder-Seite wuerde einen unbrauchbaren String an Mapbox schicken.
    const href = finderHrefFuerStadt(muenchen)
    expect(href).toContain('M%C3%BCnchen')
    expect(href).not.toContain('München')
    const p = new URL(href, 'https://claimondo.de').searchParams
    expect(p.get('stadt')).toBe('München')
  })

  it('kodiert Leerzeichen in mehrteiligen Namen', () => {
    const p = new URL(finderHrefFuerStadt(bergisch), 'https://claimondo.de').searchParams
    expect(p.get('stadt')).toBe('Bergisch Gladbach')
    expect(finderHrefFuerStadt(bergisch)).not.toContain(' ')
  })

  it('uebergibt den NAMEN, nicht den Slug', () => {
    // Der Fallback-Pfad der Finder-Seite geocodet den Wert ueber Mapbox.
    // "bergisch-gladbach" waere dort ein schlechterer Treffer als der echte Name.
    const p = new URL(finderHrefFuerStadt(bergisch), 'https://claimondo.de').searchParams
    expect(p.get('stadt')).not.toBe('bergisch-gladbach')
  })

  it('erzeugt fuer alle 92 Staedte eine gueltige URL mit endlichen Koordinaten', () => {
    const kaputt = STAEDTE.filter((s) => {
      const p = new URL(finderHrefFuerStadt(s), 'https://claimondo.de').searchParams
      const lat = Number(p.get('lat'))
      const lng = Number(p.get('lng'))
      return !Number.isFinite(lat) || !Number.isFinite(lng) || !p.get('stadt')
    })
    expect(kaputt.map((s) => s.slug)).toEqual([])
  })
})
