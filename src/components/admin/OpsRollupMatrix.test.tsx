// src/components/admin/OpsRollupMatrix.test.tsx
// env=node: renderToStaticMarkup. ClaimMainPhaseBadge gemockt (vermeidet status-Registry
// im node-Render); DataTable rendert echtes Tabellen-Markup und bleibt ungemockt.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/components/shared/ClaimMainPhaseBadge', () => ({
  default: ({ mainPhase }: { mainPhase: string | null | undefined }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('span', { 'data-phase': mainPhase ?? '' }, mainPhase ?? '')
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import OpsRollupMatrix from './OpsRollupMatrix'
import type { OpsRollup } from '@/lib/ops/ops-rollup.types'

const rollup: OpsRollup = {
  cells: [
    { phase: 'begutachtung', ownerId: 'kb1', anzahl: 3, stale: 1 },
    { phase: 'regulierung', ownerId: null, anzahl: 2, stale: 0 },
  ],
  owners: [
    { id: 'kb1', name: 'Lena Schmidt' },
    { id: null, name: 'Nicht zugewiesen' },
  ],
  phases: ['erfassung', 'begutachtung', 'regulierung', 'abschluss'],
  totalAktiv: 5,
  totalStale: 1,
}

describe('OpsRollupMatrix', () => {
  it('rendert Owner-Zeilen, Counts, Stale-Marker und Total', () => {
    const html = renderToStaticMarkup(
      React.createElement(OpsRollupMatrix, {
        rollup,
        selected: null,
        onSelect: () => {},
        overdueByCell: new Map([['begutachtung::kb1', 2]]),
      }),
    )
    expect(html).toContain('Lena Schmidt')
    expect(html).toContain('Nicht zugewiesen')
    expect(html).toContain('>3<') // Zelle begutachtung/kb1
    expect(html).toContain('2 überfällig') // overdue-Marker (TS-isOverdue)
    expect(html).toContain('>5<') // totalAktiv
  })

  it('zeigt Empty-State ohne Owners', () => {
    const html = renderToStaticMarkup(
      React.createElement(OpsRollupMatrix, {
        rollup: { ...rollup, owners: [], cells: [] },
        selected: null,
        onSelect: () => {},
        overdueByCell: new Map(),
      }),
    )
    expect(html).toContain('Keine aktiven Fälle')
  })
})
