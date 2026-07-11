// env=node: renderToStaticMarkup (kein jsdom). Actions + Modal gemockt.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth/phone-login-actions', () => ({
  starteTelefonLoginVerify: vi.fn(),
  bestaetigeTelefonLoginVerify: vi.fn(),
}))
vi.mock('@/components/primitives/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('div', null, children)
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { PhoneLoginCard } from './PhoneLoginCard'

describe('PhoneLoginCard', () => {
  it('zeigt den Titel + "aktiv" + maskierte Nummer wenn aktuellePhone gesetzt', () => {
    const html = renderToStaticMarkup(React.createElement(PhoneLoginCard, { aktuellePhone: '+491751234567' }))
    expect(html).toContain('Telefon-Login')
    expect(html).toMatch(/aktiv/i)
    expect(html).not.toContain('1751234567') // maskiert
  })
  it('zeigt "nicht aktiv" wenn keine Nummer', () => {
    const html = renderToStaticMarkup(React.createElement(PhoneLoginCard, { aktuellePhone: null }))
    expect(html).toContain('Telefon-Login')
    expect(html).toMatch(/nicht aktiv/i)
  })
})
