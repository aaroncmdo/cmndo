import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { WerkstattProfilePopup } from '../WerkstattProfilePopup'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'

const w = {
  id: 'w1',
  name: 'Autohaus Nord',
  adresse_strasse: null,
  adresse_plz: '24103',
  adresse_ort: 'Kiel',
  telefon: null,
  lat: 54.3,
  lng: 10.1,
  status: 'aktiv',
  faehigkeiten: ['karosserie'],
  verifiziert: true,
  marken: ['BMW'],
  ist_freie_werkstatt: null,
  fahrzeug_gruppen: ['pkw'],
  google_rating: 4.6,
  google_review_count: 82,
  distanz_km: 3.4,
  markenMatch: 'marke',
  gewerkeFit: 'passt',
  gruppenFit: 'passt',
  passt: true,
  gruende: [{ typ: 'marke', text: 'BMW-Vertragswerkstatt' }],
} as unknown as WerkstattVorschlag

describe('WerkstattProfilePopup', () => {
  it('rendert Firmenname + Marken-Chip + Bewertung', () => {
    const h = renderToStaticMarkup(React.createElement(WerkstattProfilePopup, { w }))
    expect(h).toContain('Autohaus Nord')
    expect(h).toContain('BMW-Vertragswerkstatt')
    expect(h).toContain('4,6')
  })
})
