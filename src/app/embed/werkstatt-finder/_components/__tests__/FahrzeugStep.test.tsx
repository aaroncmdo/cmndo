import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { FahrzeugStep } from '../FahrzeugStep'

describe('FahrzeugStep', () => {
  it('rendert Hersteller-Feld + alle Fahrzeugtyp-Optionen + gewerblich/privat', () => {
    const html = renderToStaticMarkup(
      React.createElement(FahrzeugStep, { hersteller: '', fahrzeugtyp: 'pkw', gewerbe: false, modell: '', onChange: () => {} }),
    )
    expect(html).toContain('Hersteller')
    expect(html).toContain('PKW')
    expect(html).toContain('Transporter')
    expect(html).toContain('Motorrad')
    expect(html).toContain('Anhänger')
    expect(html).toMatch(/gewerblich/i)
  })
})
