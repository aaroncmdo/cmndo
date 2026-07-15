import { describe, it, expect, vi } from 'vitest'
vi.mock('../../actions', () => ({ klassifiziereSchadenbeschreibungEmbed: vi.fn(), klassifiziereSchadenfotoEmbed: vi.fn() }))
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { SchadenStep } from '../SchadenStep'

describe('SchadenStep', () => {
  it('bietet alle drei Wege an (Fotos / Beschreibung / manuelle Auswahl)', () => {
    const html = renderToStaticMarkup(React.createElement(SchadenStep, { bedarf: null, onBedarf: () => {} }))
    expect(html).toMatch(/Foto/i)
    expect(html).toMatch(/beschreib/i)
    expect(html).toMatch(/Karosserie/i) // manuelle Gewerke-Auswahl
  })
})
