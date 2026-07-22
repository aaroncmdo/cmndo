import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { WerkstattFinder } from '../WerkstattFinder'

const row = (over: Record<string, unknown>) => ({
  id: 'w1',
  name: 'Autohaus Nord',
  adresse_strasse: null,
  adresse_plz: '24103',
  adresse_ort: 'Kiel',
  telefon: null,
  lat: 54.3,
  lng: 10.1,
  status: 'aktiv',
  faehigkeiten: null,
  verifiziert: true,
  distanz_km: 3.4,
  passt: true,
  ...over,
})

const html = (werkstaetten: unknown[]) =>
  renderToStaticMarkup(React.createElement(WerkstattFinder, { werkstaetten, onSelect: () => {} } as never))

describe('WerkstattFinder — Google-Bewertung', () => {
  it('zeigt das Google-Badge wenn google_rating gesetzt ist', () => {
    const h = html([row({ google_rating: 4.6, google_review_count: 82 })])
    expect(h).toContain('4,6')
    expect(h).toContain('(82)')
  })

  it('kein Badge ohne Rating', () => {
    const h = html([row({ google_rating: null, google_review_count: null })])
    expect(h).not.toContain('4,6')
  })
})
