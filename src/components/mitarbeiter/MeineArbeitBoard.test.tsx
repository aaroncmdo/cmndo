// MeineArbeitBoard.test.tsx
// Testet die exportierte groupWorkItemsByPhase-Hilfsfunktion mit env=node
// (kein @testing-library/react, kein jsdom — vitest.config.ts: environment='node').
// JSX-Korrektheit wird durch tsc (npx tsc --noEmit) abgedeckt.
import { describe, it, expect } from 'vitest'
import { groupWorkItemsByPhase } from './MeineArbeitBoard'
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
