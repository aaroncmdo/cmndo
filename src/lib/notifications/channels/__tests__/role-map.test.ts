import { describe, it, expect } from 'vitest'
import { ROLE_MAP } from '../in-app'

// #updates-rebuild Phase 1: jede Profil-Rolle muss gemappt sein, sonst kriegt
// die Rolle keine in-app-Mitteilungen (leere Bell). leadbearbeiter ist der
// tote Enum-Wert des Dispatchers -> Alias auf dispatch.
const PROFILE_ROLES = [
  'kunde', 'sachverstaendiger', 'admin', 'kanzlei', 'leadbearbeiter',
  'dispatch', 'kundenbetreuer', 'makler', 'werkstatt',
] as const

describe('ROLE_MAP — vollstaendige Rollen-Coverage', () => {
  it('mappt JEDE Profil-Rolle (keine leere Bell)', () => {
    for (const r of PROFILE_ROLES) {
      expect(ROLE_MAP[r], `Rolle ${r} fehlt in ROLE_MAP`).toBeDefined()
    }
  })

  it('leadbearbeiter ist Alias auf dispatch (gleiche logische Rolle)', () => {
    expect(ROLE_MAP['leadbearbeiter']).toBe('dispatch')
  })
})
