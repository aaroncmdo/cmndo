import { describe, it, expect, vi } from 'vitest'

// Repo-Idiom (siehe FaelleHubHeader.test.tsx): vitest laeuft environment:'node',
// es gibt KEIN jsdom/RTL. Server-Components werden via renderToStaticMarkup
// gerendert; next/link wird auf ein <a> gemockt.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('a', { href, ...rest }, children as never)
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import EntityDetailShell, { type DetailTab } from './EntityDetailShell'

const TABS: DetailTab[] = [
  { key: 'stammdaten', label: 'Stammdaten', href: '/admin/organisationen/o1' },
  { key: 'faelle', label: 'Fälle', href: '/admin/organisationen/o1?tab=faelle', badgeCount: 3 },
]

type Props = React.ComponentProps<typeof EntityDetailShell>

function render(props: Partial<Props> = {}) {
  return renderToStaticMarkup(
    React.createElement(EntityDetailShell, {
      title: 'Muster GmbH',
      children: React.createElement('p', null, 'INHALT'),
      ...props,
    } as Props),
  )
}

describe('EntityDetailShell', () => {
  it('rendert Titel und Content', () => {
    const html = render()
    expect(html).toContain('Muster GmbH')
    expect(html).toContain('INHALT')
  })

  it('rendert Tabs als Links und markiert den aktiven Tab', () => {
    const html = render({ tabs: TABS, activeTab: 'faelle' })
    expect(html).toContain('href="/admin/organisationen/o1?tab=faelle"')
    expect(html).toContain('Stammdaten')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>3<')
  })

  it('rendert keine Tab-Nav wenn tabs fehlen', () => {
    const html = render()
    expect(html).not.toContain('Detail-Tabs')
  })

  it('zeigt den Zurueck-Link in variant=page', () => {
    const html = render({ backHref: '/admin/organisationen', backLabel: 'Organisationen' })
    expect(html).toContain('href="/admin/organisationen"')
    expect(html).toContain('Organisationen')
  })

  it('unterdrueckt den Zurueck-Link in variant=drawer', () => {
    const html = render({
      backHref: '/admin/organisationen',
      backLabel: 'Organisationen',
      variant: 'drawer',
    })
    expect(html).not.toContain('href="/admin/organisationen"')
  })

  it('rendert die Sidebar nur wenn uebergeben', () => {
    expect(render({ sidebar: React.createElement('div', null, 'SIDEBAR') })).toContain('SIDEBAR')
    expect(render()).not.toContain('SIDEBAR')
  })
})
