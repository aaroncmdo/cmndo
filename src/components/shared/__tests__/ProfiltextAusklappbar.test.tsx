// Erstrender der ausklappbaren Profilbeschreibung (Aaron 19.09.2026). Ohne DOM-Testumgebung
// (vitest environment: node) wird per renderToStaticMarkup der Server-/Erstzustand geprueft:
// kurz = ganzer Text ohne Schaltflaeche, lang = gekuerzt + "Mehr anzeigen" + aria-expanded=false.
// Das Umschalten selbst beweist der Regel-4-Smoke auf prod (Klick, innerText).
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { ProfiltextAusklappbar } from '@/components/shared/ProfiltextAusklappbar'

const LANG = Array.from({ length: 80 }, (_, i) => `Wort${i}`).join(' ')

describe('ProfiltextAusklappbar (Erstrender)', () => {
  it('rendert kurze Texte ganz und ohne Schaltflaeche', () => {
    const html = renderToStaticMarkup(React.createElement(ProfiltextAusklappbar, { text: 'Kurz und gut.' }))
    expect(html).toContain('Kurz und gut.')
    expect(html).not.toContain('<button')
  })

  it('rendert lange Texte gekuerzt mit „Mehr anzeigen" und aria-expanded=false', () => {
    const html = renderToStaticMarkup(React.createElement(ProfiltextAusklappbar, { text: LANG }))
    expect(html).toContain('…')
    expect(html).not.toContain('Wort79')
    expect(html).toContain('Mehr anzeigen')
    expect(html).toContain('aria-expanded="false"')
  })

  it('nimmt eigene Beschriftungen an (i18n in der Terminwahl)', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfiltextAusklappbar, { text: LANG, mehrLabel: 'Show more', wenigerLabel: 'Show less' }),
    )
    expect(html).toContain('Show more')
    expect(html).not.toContain('Mehr anzeigen')
  })

  it('setzt auf Wunsch typografische Anfuehrungszeichen um den Text (Finder-Popup)', () => {
    const html = renderToStaticMarkup(React.createElement(ProfiltextAusklappbar, { text: 'Kurz.', anfuehrungszeichen: true }))
    expect(html).toContain('„Kurz.“')
  })

  it('rendert bei leerem Text nichts', () => {
    expect(renderToStaticMarkup(React.createElement(ProfiltextAusklappbar, { text: '  ' }))).toBe('')
    expect(renderToStaticMarkup(React.createElement(ProfiltextAusklappbar, { text: null }))).toBe('')
  })
})
