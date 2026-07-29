import { describe, it, expect } from 'vitest'
import { wizardStorageKey } from './wizard-storage'

describe('wizardStorageKey', () => {
  // Bug3-Smoke-Nebenbefund 28.07.: Key nur flowKey-scoped -> "Fortschritt
  // wiederhergestellt" restaurierte den ZULETZT bearbeiteten Fall desselben
  // Kunden (Cross-Fall-Contamination bei Mehrfall-Kunden).
  it('scoped den Key auf den Fall, wenn eine fallId vorliegt', () => {
    expect(wizardStorageKey('kunde-onboarding', 'abc-123')).toBe(
      'claimondo-wizard-state:kunde-onboarding:abc-123',
    )
  })

  it('bleibt ohne fallId beim bisherigen Key (sv-onboarding & Co. unveraendert)', () => {
    expect(wizardStorageKey('sv-onboarding')).toBe('claimondo-wizard-state:sv-onboarding')
    expect(wizardStorageKey('kunde-onboarding', null)).toBe('claimondo-wizard-state:kunde-onboarding')
    expect(wizardStorageKey('kunde-onboarding', undefined)).toBe('claimondo-wizard-state:kunde-onboarding')
  })

  it('behandelt Leerstring-fallId wie keine fallId', () => {
    expect(wizardStorageKey('kunde-onboarding', '')).toBe('claimondo-wizard-state:kunde-onboarding')
  })
})
