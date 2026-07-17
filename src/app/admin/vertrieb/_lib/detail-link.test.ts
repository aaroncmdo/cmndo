import { describe, it, expect } from 'vitest'
import { detailLink } from './detail-link'

describe('detailLink (P3: gemountete Routen unter dem Dach)', () => {
  it('SV + Werkstatt → gemountete Einzel-Akte mit id', () => {
    expect(detailLink('sv', 'abc')).toEqual({
      href: '/admin/vertrieb/sachverstaendige/abc',
      label: 'Vollständige Akte öffnen',
    })
    expect(detailLink('werkstatt', 'xyz')).toEqual({
      href: '/admin/vertrieb/werkstaetten/xyz',
      label: 'Vollständige Akte öffnen',
    })
  })

  it('Firmen-Flotte → gemountete Einzel-Akte mit firma-id', () => {
    expect(detailLink('firmen-flotte', 'f1')).toEqual({
      href: '/admin/vertrieb/firmen-flotte/f1',
      label: 'Vollständige Akte öffnen',
    })
  })

  it('Makler → Einzel-Akte mit id (B3)', () => {
    expect(detailLink('makler', 'm1')).toEqual({
      href: '/admin/vertrieb/makler/m1',
      label: 'Vollständige Akte öffnen',
    })
  })

  it('Partner-Lead → gemountete Liste', () => {
    expect(detailLink('partner-lead', 'p1').href).toBe('/admin/vertrieb/partner-leads')
  })

  it('alle Ziele bleiben unter /admin/vertrieb (in der Konsole)', () => {
    for (const kind of ['sv', 'werkstatt', 'makler', 'partner-lead', 'firmen-flotte'] as const) {
      expect(detailLink(kind, 'x').href.startsWith('/admin/vertrieb/')).toBe(true)
    }
  })
})
