import { describe, it, expect } from 'vitest'
import { classifyOrchestratorHealth } from './orchestrator-pipeline'

describe('classifyOrchestratorHealth', () => {
  it('ok bei gesundem Betrieb', () => {
    expect(
      classifyOrchestratorHealth({ offen: 5, letzterLaufVorStunden: 2, fehlerBeimLetztenLauf: false }).status,
    ).toBe('ok')
  })
  it('warn wenn seit >26h kein Lauf', () => {
    expect(
      classifyOrchestratorHealth({ offen: 0, letzterLaufVorStunden: 30, fehlerBeimLetztenLauf: false }).status,
    ).toBe('warn')
  })
  it('warn bei Rückstau offener Vorschläge (>50)', () => {
    expect(
      classifyOrchestratorHealth({ offen: 60, letzterLaufVorStunden: 1, fehlerBeimLetztenLauf: false }).status,
    ).toBe('warn')
  })
  it('crit bei Fehler im letzten Lauf', () => {
    expect(
      classifyOrchestratorHealth({ offen: 0, letzterLaufVorStunden: 1, fehlerBeimLetztenLauf: true }).status,
    ).toBe('crit')
  })
})
