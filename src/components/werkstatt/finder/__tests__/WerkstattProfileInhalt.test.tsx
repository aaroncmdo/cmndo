import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { WerkstattProfileInhalt, type WerkstattProfilData } from '../WerkstattProfileInhalt'

const base: WerkstattProfilData = {
  name: 'Autohaus Nord',
  ort: 'Kiel',
  verifiziert: true,
  googleRating: 4.6,
  googleAnzahl: 82,
  gruende: [
    { typ: 'marke', text: 'BMW-Vertragswerkstatt' },
    { typ: 'gewerk', text: 'Repariert Karosserie' },
    { typ: 'distanz', text: '3 km' },
  ],
  distanzKm: 3.4,
  fahrzeugGruppen: ['pkw', 'transporter'],
}

const html = (props: Parameters<typeof WerkstattProfileInhalt>[0]) =>
  renderToStaticMarkup(React.createElement(WerkstattProfileInhalt, props))

describe('WerkstattProfileInhalt', () => {
  it('zeigt Firmenname, Region und Verifiziert-Marker', () => {
    const h = html({ data: base })
    expect(h).toContain('Autohaus Nord')
    expect(h).toContain('Werkstatt in Kiel')
    expect(h).toContain('Verifizierter Claimondo-Partner')
  })

  it('zeigt Marken-/Gewerke-Chips + Google-Bewertung, aber NICHT den distanz-Grund als Chip', () => {
    const h = html({ data: base })
    expect(h).toContain('BMW-Vertragswerkstatt')
    expect(h).toContain('Repariert Karosserie')
    expect(h).toContain('4,6') // GoogleBewertungBadge (sm)
    expect(h).toContain('(82)')
    expect(h).not.toContain('3 km') // distanz-Grund wird nicht als Chip gerendert
  })

  it('graceful: kein Rating -> kein Badge; kein Ort -> "Ihrer Nähe"; nicht verifiziert -> kein Marker', () => {
    const h = html({
      data: { ...base, name: 'Freie Werkstatt X', ort: null, verifiziert: false, googleRating: null, googleAnzahl: null },
    })
    expect(h).toContain('Werkstatt in Ihrer Nähe')
    expect(h).not.toContain('4,6')
    expect(h).not.toContain('Verifizierter Claimondo-Partner')
  })

  it('Fahrzeug-Gruppen + Distanz nur bei aktiviertem Flag', () => {
    expect(html({ data: base })).not.toContain('Transporter')
    const h = html({ data: base, zeigeFahrzeugGruppen: true, zeigeDistanz: true })
    expect(h).toContain('Transporter')
    expect(h).toContain('3,4 km entfernt')
  })

  it('Badge nur bei belastbarer Bewertung (>= 4,0 & >= 5): niedrig/wenige -> kein Badge', () => {
    expect(html({ data: { ...base, googleRating: 3.5, googleAnzahl: 40 } })).not.toContain('3,5') // <4,0
    expect(html({ data: { ...base, googleRating: 4.9, googleAnzahl: 3 } })).not.toContain('4,9') // <5 Bewertungen
    expect(html({ data: { ...base, googleRating: 4.2, googleAnzahl: 12 } })).toContain('4,2') // belastbar -> Badge
  })
})
