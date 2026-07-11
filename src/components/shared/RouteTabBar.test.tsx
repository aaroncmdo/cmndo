// env=node: renderToStaticMarkup. usePathname + next/link gemockt.
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
import RouteTabBar from './RouteTabBar'

describe('RouteTabBar', () => {
  it('renders all tabs, marks the active one, renders a badge', () => {
    const html = renderToStaticMarkup(
      React.createElement(RouteTabBar, {
        tabs: [
          { href: '/admin/faelle', label: 'Liste', exact: true },
          { href: '/admin/faelle/sla', label: 'SLA' },
          { href: '/admin/faelle/reklamationen', label: 'Reklamationen', badge: 4 },
        ],
      }),
    )
    expect(html).toContain('Liste')
    expect(html).toContain('SLA')
    expect(html).toContain('aria-current="page"') // die aktive (SLA) Tab
    expect(html).toContain('>4<') // Badge
  })
})
