import { describe, it, expect } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
import { CardLink } from '../CardLink'

// HINWEIS: Das Repo nutzt `environment: 'node'` in vitest.config.ts und hat KEIN
// @testing-library/react / jsdom installiert (0 Vorkommen in src/). Statt einen
// kompletten DOM-Test-Stack einzufuehren, inspizieren wir den von CardLink
// zurueckgelieferten React-Element-Tree direkt — deckt dieselben 5 Verhalten ab
// wie der DOM-Render-Test aus Doc 41 §1.2 (href, aria-label, ctaLabel, children,
// data-tracking, variant-class), ohne neue Dependencies.

type AnyProps = { props: Record<string, unknown> }

function collectStrings(node: ReactNode): string[] {
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(collectStrings)
  if (node && typeof node === 'object' && 'props' in node) {
    return collectStrings((node as AnyProps).props.children as ReactNode)
  }
  return []
}

describe('CardLink', () => {
  it('liefert ein Link-Element mit href und Default-aria-label', () => {
    const el = CardLink({ href: '/test', title: 'Test-Titel', body: 'Body-Text' })
    expect(isValidElement(el)).toBe(true)
    expect((el.props as Record<string, unknown>).href).toBe('/test')
    expect((el.props as Record<string, unknown>)['aria-label']).toBe('Test-Titel — Mehr erfahren')
  })

  it('nutzt ctaLabel im aria-label', () => {
    const el = CardLink({ href: '/x', title: 'T', ctaLabel: 'Spezial-CTA' })
    expect((el.props as Record<string, unknown>)['aria-label']).toBe('T — Spezial-CTA')
  })

  it('ariaLabel-Override schlaegt den Default', () => {
    const el = CardLink({ href: '/x', title: 'T', ariaLabel: 'Eigenes Label' })
    expect((el.props as Record<string, unknown>)['aria-label']).toBe('Eigenes Label')
  })

  it('rendert title, body und children im Element-Tree', () => {
    const el = CardLink({ href: '/x', title: 'Titel-X', body: 'Body-Y', children: 'extra' })
    const strings = collectStrings(el)
    expect(strings).toContain('Titel-X')
    expect(strings).toContain('Body-Y')
    expect(strings).toContain('extra')
  })

  it('setzt data-tracking wenn trackingId gegeben', () => {
    const el = CardLink({ href: '/x', title: 'T', trackingId: 'card-test' })
    expect((el.props as Record<string, unknown>)['data-tracking']).toBe('card-test')
  })

  it('glass-Variant nutzt backdrop-blur-md, default nicht', () => {
    const glass = CardLink({ href: '/x', title: 'T', variant: 'glass' })
    const base = CardLink({ href: '/x', title: 'T' })
    expect(String((glass.props as Record<string, unknown>).className)).toContain('backdrop-blur-md')
    expect(String((base.props as Record<string, unknown>).className)).toContain('shadow-claimondo-sm')
  })
})
