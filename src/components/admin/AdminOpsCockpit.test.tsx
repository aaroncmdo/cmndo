// src/components/admin/AdminOpsCockpit.test.tsx
// env=node: renderToStaticMarkup. OpsRollupMatrix + WorkItemCard gemockt zu Stubs,
// damit der Test die Komposition (KPIs + Attention + Empty) isoliert prueft.
import { describe, it, expect, vi } from 'vitest'

vi.mock('./OpsRollupMatrix', () => ({
  default: () => {
    const React = require('react') as typeof import('react')
    return React.createElement('div', { 'data-matrix': '1' })
  },
}))
vi.mock('@/components/ops/WorkItemCard', () => ({
  default: ({ item, ownerName }: { item: { id: string }; ownerName?: string }) => {
    const React = require('react') as typeof import('react')
    return React.createElement('div', { 'data-wi': item.id, 'data-owner': ownerName ?? '' })
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import AdminOpsCockpit from './AdminOpsCockpit'
import type { OpsRollup } from '@/lib/ops/ops-rollup.types'
import type { ClaimWorkItem } from '@/lib/ops/claim-workstate.types'

const rollup: OpsRollup = {
  cells: [{ phase: 'begutachtung', ownerId: 'kb1', anzahl: 1, stale: 0 }],
  owners: [{ id: 'kb1', name: 'Lena Schmidt' }],
  phases: ['erfassung', 'begutachtung', 'regulierung', 'abschluss'],
  totalAktiv: 1,
  totalStale: 0,
}

function makeItem(over: Partial<ClaimWorkItem> = {}): ClaimWorkItem {
  return {
    kind: 'claim', id: 'c1', fallId: 'f1', kundenbetreuerId: 'kb1', claimNummer: 'CLM-1',
    stage: 'begutachtung', subState: 'gutachten', nextActionCode: 'gutachten_ausstehend',
    ownerRole: 'sv', waitingOn: 'sv', isOverdue: false, overdueSinceDays: null,
    display: { title: 'Müller', kennzeichen: 'K-1', schadenhoehe: null },
    editable: { notizen: null, interneNotizen: null, schadensHoeheNetto: null },
    ...over,
  }
}

describe('AdminOpsCockpit', () => {
  it('rendert KPI-Labels, Matrix und die Aufmerksamkeits-Liste mit ueberfaelligem Item', () => {
    const items = [makeItem({ id: 'a', isOverdue: true, overdueSinceDays: 5 }), makeItem({ id: 'b', kundenbetreuerId: null })]
    const html = renderToStaticMarkup(React.createElement(AdminOpsCockpit, { rollup, items }))
    expect(html).toContain('Aktive Fälle')
    expect(html).toContain('Überfällig')
    expect(html).toContain('Nicht zugewiesen')
    expect(html).toContain('data-matrix="1"') // Matrix eingebunden
    expect(html).toContain('data-wi="a"') // ueberfaelliges Item in der Attention-Liste
    expect(html).toContain('Braucht Aufmerksamkeit')
  })

  it('leere Ueberfaellig-Liste zeigt Feier-Text', () => {
    const html = renderToStaticMarkup(React.createElement(AdminOpsCockpit, { rollup, items: [makeItem({ id: 'x' })] }))
    expect(html).toContain('Nichts Überfälliges')
  })
})
