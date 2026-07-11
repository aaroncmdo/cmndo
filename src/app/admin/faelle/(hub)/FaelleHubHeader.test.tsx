import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/faelle/sla' }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('a', { href, ...rest }, children as never)
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import FaelleHubHeader from './FaelleHubHeader'

describe('FaelleHubHeader', () => {
  it('renders hub title, tabs, the active tab subtitle and the reklamationen badge', () => {
    const html = renderToStaticMarkup(React.createElement(FaelleHubHeader, { offeneReklamationen: 3 }))
    expect(html).toContain('Fälle') // Hub-Titel
    expect(html).toContain('SLA')
    expect(html).toContain('Pipeline-Fristen') // Untertitel der aktiven SLA-Tab
    expect(html).toContain('>3<') // Reklamationen-Badge
  })
})
