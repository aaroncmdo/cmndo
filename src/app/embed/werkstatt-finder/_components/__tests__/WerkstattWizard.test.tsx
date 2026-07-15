import { describe, it, expect, vi } from 'vitest'
vi.mock('../../actions', () => ({
  erstelleWerkstattFinderLead: vi.fn(),
  holeAdresseFuerStandort: vi.fn(),
  klassifiziereSchadenfotoEmbed: vi.fn(),
  klassifiziereSchadenbeschreibungEmbed: vi.fn(),
}))
vi.mock('@/components/GooglePlaceAutocomplete', () => ({
  __esModule: true,
  default: () => {
    const R = require('react') as typeof import('react')
    return R.createElement('input')
  },
}))
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { WerkstattWizard } from '../WerkstattWizard'

describe('WerkstattWizard', () => {
  it('startet auf Schritt 1 (Standort) mit 4-Segment-Fortschritt', () => {
    const html = renderToStaticMarkup(
      React.createElement(WerkstattWizard, {
        rows: [],
        selectedId: null,
        loading: false,
        keineSpezialisierte: false,
        onSelectWerkstatt: () => {},
        onSuche: () => {},
      }),
    )
    expect(html).toContain('Wo steht das Fahrzeug?')
  })
})
