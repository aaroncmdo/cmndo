import { describe, it, expect } from 'vitest'
import { statusLabel } from '@/lib/status'
import { VERTRIEB_WORKFLOW_DEFS, ALL_VERTRIEB_STUFEN } from './vertrieb-workflow'

describe('vertrieb-workflow registry', () => {
  it('jede Stufe hat Label + Slot und ist registriert (statusLabel resolved via Registry)', () => {
    expect(ALL_VERTRIEB_STUFEN.length).toBe(7)
    for (const s of ALL_VERTRIEB_STUFEN) {
      expect(VERTRIEB_WORKFLOW_DEFS[s].label).toBeTruthy()
      expect(VERTRIEB_WORKFLOW_DEFS[s].slot).toBeTruthy()
      // Beweist die Registrierung in registry.ts + types.ts (DomainName):
      expect(statusLabel('vertrieb-workflow', s)).toBe(VERTRIEB_WORKFLOW_DEFS[s].label)
    }
  })

  it('Slot-Semantik: aktiv=success, gesperrt=danger, onboarding=pending', () => {
    expect(VERTRIEB_WORKFLOW_DEFS.aktiv.slot).toBe('success')
    expect(VERTRIEB_WORKFLOW_DEFS.gesperrt.slot).toBe('danger')
    expect(VERTRIEB_WORKFLOW_DEFS.onboarding.slot).toBe('pending')
    expect(VERTRIEB_WORKFLOW_DEFS.verloren.isEndzustand).toBe(true)
  })
})
