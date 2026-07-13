// env=node (vitest global): renderToStaticMarkup, kein next-Hook -> keine Mocks noetig.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import PageHeader from './PageHeader'

describe('PageHeader', () => {
  it('rendert Titel + Beschreibung standardmaessig in einer Floating-Card', () => {
    const html = renderToStaticMarkup(
      React.createElement(PageHeader, { title: 'Finanzen', description: 'Umsatz und Provision' }),
    )
    expect(html).toContain('Finanzen')
    expect(html).toContain('Umsatz und Provision')
    expect(html).toContain('page-header-card') // Card-Surface aktiv
  })

  it('rendert ohne Card wenn bare', () => {
    const html = renderToStaticMarkup(
      React.createElement(PageHeader, { title: 'Login', bare: true }),
    )
    expect(html).toContain('Login')
    expect(html).not.toContain('page-header-card')
  })

  it('rendert ohne Card bei align=center (Auth/Wizard)', () => {
    const html = renderToStaticMarkup(
      React.createElement(PageHeader, { title: 'Anmelden', align: 'center' }),
    )
    expect(html).toContain('Anmelden')
    expect(html).not.toContain('page-header-card')
  })

  it('rendert children innerhalb der Card', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        PageHeader,
        { title: 'Faelle' },
        React.createElement('nav', null, 'HUBTABS'),
      ),
    )
    expect(html).toContain('page-header-card')
    expect(html).toContain('HUBTABS')
  })
})
