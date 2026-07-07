// MeineArbeitBoard.test.tsx
// Testet die exportierte groupWorkItemsByPhase-Hilfsfunktion mit env=node
// (kein @testing-library/react, kein jsdom — vitest.config.ts: environment='node').
// JSX-Korrektheit wird durch tsc (npx tsc --noEmit) abgedeckt.
//
// Render-Tests: renderToStaticMarkup aus react-dom/server (node-native),
// next/link und FallPhaseBadge werden zu plain HTML-Elementen gemockt.
import { describe, it, expect, vi } from 'vitest'

// -- Mocks BEFORE any component import --

// next/link -> plain <a href> so renderToStaticMarkup works in node
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('a', { href, className }, children)
  },
}))

// FallPhaseBadge -> plain <span data-subphase> (avoids status-registry deps in node render)
vi.mock('@/components/shared/FallPhaseBadge', () => ({
  default: ({ subPhase }: { subPhase: string | null | undefined }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('span', { 'data-subphase': subPhase ?? '' })
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import MeineArbeitBoard, { groupWorkItemsByPhase } from './MeineArbeitBoard'
import type { ClaimWorkItem } from '@/lib/ops/claim-workstate.types'

function makeItem(over: Partial<ClaimWorkItem> = {}): ClaimWorkItem {
  return {
    kind: 'claim',
    id: 'c1',
    fallId: 'f1',
    claimNummer: 'CLM-1',
    stage: 'begutachtung',
    subState: 'gutachten',
    nextActionCode: 'gutachten_ausstehend',
    ownerRole: 'sv',
    waitingOn: 'sv',
    isOverdue: false,
    overdueSinceDays: null,
    display: { title: 'Müller', kennzeichen: 'K-AB 1', schadenhoehe: 4500 },
    ...over,
  }
}

// ---------------------------------------------------------------------------
// Render-Branch Tests (renderToStaticMarkup)
// ---------------------------------------------------------------------------

describe('MeineArbeitBoard — render branches', () => {
  it('leere Items rendern "Keine aktiven Fälle" (empty state)', () => {
    const html = renderToStaticMarkup(React.createElement(MeineArbeitBoard, { items: [] }))
    expect(html).toContain('Keine aktiven Fälle')
  })

  it('item mit fallId rendert einen Link mit href="/faelle/<id>"', () => {
    const item = makeItem({ id: 'c1', fallId: 'f1', stage: 'begutachtung', subState: 'gutachten' })
    const html = renderToStaticMarkup(React.createElement(MeineArbeitBoard, { items: [item] }))
    expect(html).toContain('href="/faelle/f1"')
  })

  it('item ohne fallId rendert KEINEN /faelle/-href', () => {
    const item = makeItem({ id: 'c2', fallId: null, stage: 'begutachtung', subState: 'gutachten' })
    const html = renderToStaticMarkup(React.createElement(MeineArbeitBoard, { items: [item] }))
    expect(html).not.toContain('/faelle/')
  })

  it('ueberfaelliges item rendert "überfällig" mit korrekter Tageszahl', () => {
    const item = makeItem({
      id: 'c3',
      stage: 'begutachtung',
      subState: 'gutachten',
      isOverdue: true,
      overdueSinceDays: 14,
    })
    const html = renderToStaticMarkup(React.createElement(MeineArbeitBoard, { items: [item] }))
    expect(html).toContain('überfällig')
    expect(html).toContain('14')
  })

  it('rendert ctaLabel "Gutachten anfordern" und Spalten-Titel "Begutachtung"', () => {
    const item = makeItem({ stage: 'begutachtung', subState: 'gutachten' })
    const html = renderToStaticMarkup(React.createElement(MeineArbeitBoard, { items: [item] }))
    expect(html).toContain('Gutachten anfordern')
    expect(html).toContain('Begutachtung')
  })
})

// ---------------------------------------------------------------------------
// Pure-Logic Tests (groupWorkItemsByPhase)
// ---------------------------------------------------------------------------

describe('groupWorkItemsByPhase', () => {
  it('gibt leere Arrays fuer alle Phasen zurueck wenn keine Items', () => {
    const result = groupWorkItemsByPhase([])
    expect(result.erfassung).toHaveLength(0)
    expect(result.begutachtung).toHaveLength(0)
    expect(result.regulierung).toHaveLength(0)
  })

  it('gruppiert Items nach Hauptphase', () => {
    const items = [
      makeItem({ id: 'c1', stage: 'begutachtung' }),
      makeItem({ id: 'c2', stage: 'regulierung', subState: 'versicherungskontakt' }),
      makeItem({ id: 'c3', stage: 'erfassung', subState: 'sa_offen' }),
    ]
    const result = groupWorkItemsByPhase(items)
    expect(result.begutachtung).toHaveLength(1)
    expect(result.regulierung).toHaveLength(1)
    expect(result.erfassung).toHaveLength(1)
    expect(result.begutachtung[0].id).toBe('c1')
    expect(result.regulierung[0].id).toBe('c2')
    expect(result.erfassung[0].id).toBe('c3')
  })

  it('sortiert ueberfaellige Items zuerst innerhalb einer Spalte', () => {
    const items = [
      makeItem({ id: 'c1', stage: 'begutachtung', isOverdue: false, overdueSinceDays: null }),
      makeItem({ id: 'c2', stage: 'begutachtung', isOverdue: true, overdueSinceDays: 14 }),
      makeItem({ id: 'c3', stage: 'begutachtung', isOverdue: true, overdueSinceDays: 5 }),
    ]
    const result = groupWorkItemsByPhase(items)
    expect(result.begutachtung[0].id).toBe('c2') // 14 Tage > 5 Tage -> zuerst
    expect(result.begutachtung[1].id).toBe('c3') // 5 Tage -> zweite
    expect(result.begutachtung[2].id).toBe('c1') // nicht ueberfaellig -> zuletzt
  })

  it('mehrere ueberfaellige Items werden nach Tagen absteigend sortiert', () => {
    const items = [
      makeItem({ id: 'c1', stage: 'regulierung', subState: 'versicherungskontakt', isOverdue: true, overdueSinceDays: 3 }),
      makeItem({ id: 'c2', stage: 'regulierung', subState: 'versicherungskontakt', isOverdue: true, overdueSinceDays: 10 }),
      makeItem({ id: 'c3', stage: 'regulierung', subState: 'versicherungskontakt', isOverdue: true, overdueSinceDays: 7 }),
    ]
    const result = groupWorkItemsByPhase(items)
    expect(result.regulierung[0].id).toBe('c2') // 10
    expect(result.regulierung[1].id).toBe('c3') // 7
    expect(result.regulierung[2].id).toBe('c1') // 3
  })

  it('Items in abschluss-Phase landen in abschluss-Bucket (ausgefiltert vom Board)', () => {
    const items = [
      makeItem({ id: 'c1', stage: 'abschluss', subState: 'erfolgreich_reguliert' }),
    ]
    const result = groupWorkItemsByPhase(items)
    expect(result.abschluss).toHaveLength(1)
    expect(result.erfassung).toHaveLength(0)
  })
})
