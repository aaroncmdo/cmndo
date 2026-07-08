import { describe, it, expect } from 'vitest'
import { detailLink } from './detail-link'

describe('detailLink', () => {
  it('SV + Werkstatt → Einzel-Akte mit id', () => {
    expect(detailLink('sv', 'abc')).toEqual({
      href: '/admin/sachverstaendige/abc',
      label: 'Vollständige Akte öffnen',
    })
    expect(detailLink('werkstatt', 'xyz')).toEqual({
      href: '/admin/werkstaetten/xyz',
      label: 'Vollständige Akte öffnen',
    })
  })

  it('Makler/Partner-Lead/SV-Lead → Listen-Route (id noch nicht fokussiert)', () => {
    expect(detailLink('makler', 'm1').href).toBe('/admin/makler')
    expect(detailLink('partner-lead', 'p1').href).toBe('/admin/partner-leads')
    expect(detailLink('sv-lead', 's1').href).toBe('/admin/sachverstaendige/leads')
  })
})
