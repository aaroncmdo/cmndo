// src/components/ops/WorkItemCard.test.tsx
// env=node: renderToStaticMarkup (no jsdom). next/link + FallPhaseBadge + ClaimHoverCard
// gemockt zu plain Elementen, damit der Test WorkItemCards eigenes Rendering prueft.
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('a', { href, className }, children)
  },
}))
vi.mock('@/components/shared/FallPhaseBadge', () => ({
  default: ({ subPhase }: { subPhase: string | null | undefined }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('span', { 'data-subphase': subPhase ?? '' })
  },
}))
vi.mock('@/components/mitarbeiter/ClaimHoverCard', () => ({
  default: () => {
    const React = require('react') as typeof import('react')
    return React.createElement('div', { 'data-hover': '1' })
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import WorkItemCard from './WorkItemCard'
import type { ClaimWorkItem } from '@/lib/ops/claim-workstate.types'

function makeItem(over: Partial<ClaimWorkItem> = {}): ClaimWorkItem {
  return {
    kind: 'claim', id: 'c1', fallId: 'f1', kundenbetreuerId: 'kb1', claimNummer: 'CLM-1',
    stage: 'begutachtung', subState: 'gutachten', nextActionCode: 'gutachten_ausstehend',
    ownerRole: 'sv', waitingOn: 'sv', isOverdue: false, overdueSinceDays: null,
    display: { title: 'Müller', kennzeichen: 'K-AB 1', schadenhoehe: 4500 },
    editable: { notizen: null, interneNotizen: null, schadensHoeheNetto: null },
    ...over,
  }
}

describe('WorkItemCard', () => {
  it('rendert Titel, Next-Action-Copy und /faelle-Link', () => {
    const html = renderToStaticMarkup(React.createElement(WorkItemCard, { item: makeItem() }))
    expect(html).toContain('Müller')
    expect(html).toContain('Gutachten anfordern')
    expect(html).toContain('href="/faelle/f1"')
  })
  it('zeigt ownerName wenn gesetzt (Admin-Kontext)', () => {
    const html = renderToStaticMarkup(React.createElement(WorkItemCard, { item: makeItem(), ownerName: 'Lena Schmidt' }))
    expect(html).toContain('Lena Schmidt')
  })
  it('zeigt den Ueberfaellig-Marker mit Tageszahl', () => {
    const html = renderToStaticMarkup(React.createElement(WorkItemCard, { item: makeItem({ isOverdue: true, overdueSinceDays: 9 }) }))
    expect(html).toContain('überfällig')
    expect(html).toContain('9')
  })
  it('rendert KEINEN /faelle-Link wenn fallId null', () => {
    const html = renderToStaticMarkup(React.createElement(WorkItemCard, { item: makeItem({ fallId: null }) }))
    expect(html).not.toContain('/faelle/')
  })
})
