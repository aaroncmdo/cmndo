// env=node: renderToStaticMarkup. Places + Action gemockt (kein Google-Script, kein Server).
import { describe, it, expect, vi } from 'vitest'
vi.mock('../../actions', () => ({ holeAdresseFuerStandort: vi.fn() }))
vi.mock('@/components/GooglePlaceAutocomplete', () => ({
  __esModule: true,
  default: () => {
    const React = require('react') as typeof import('react')
    return React.createElement('input', { 'data-testid': 'places' })
  },
}))
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { StandortStep } from '../StandortStep'

describe('StandortStep', () => {
  it('zeigt die Standort-Frage + den „Aktuellen Standort"-Button', () => {
    const html = renderToStaticMarkup(React.createElement(StandortStep, { standort: null, onStandort: () => {} }))
    expect(html).toContain('Wo steht das Fahrzeug?')
    expect(html).toContain('Aktuellen Standort verwenden')
  })
  it('zeigt die gewählte Adresse an', () => {
    const html = renderToStaticMarkup(
      React.createElement(StandortStep, {
        standort: { adresse: 'Musterstr. 1, Köln', lat: 50.9, lng: 6.9 },
        onStandort: () => {},
      }),
    )
    expect(html).toContain('Musterstr. 1, Köln')
  })
})
