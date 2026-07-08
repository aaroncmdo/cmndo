import { describe, expect, it } from 'vitest'
import { isOperativeUpdatesRole } from '../updates-page-access'

// Phase 5 Teil D: /updates-Vollseite ist fuer OPERATIVE Rollen (echte Worklists).
// Kunde/makler bleiben beim Popover -> Vollseite redirected sie auf ihr Portal.
describe('isOperativeUpdatesRole — /updates-Vollseite Zugriff', () => {
  it('operative Rollen bekommen die Worklist (true)', () => {
    for (const r of [
      'admin',
      'dispatch',
      'leadbearbeiter', // toter Enum-Wert = Dispatcher-Alias
      'sachverstaendiger',
      'kundenbetreuer',
      'kanzlei',
      'werkstatt',
    ]) {
      expect(isOperativeUpdatesRole(r), `${r} sollte operativ sein`).toBe(true)
    }
  })

  it('kunde + makler nur Popover (false)', () => {
    expect(isOperativeUpdatesRole('kunde')).toBe(false)
    expect(isOperativeUpdatesRole('makler')).toBe(false)
  })

  it('unbekannt/leer defensiv false', () => {
    expect(isOperativeUpdatesRole('')).toBe(false)
    expect(isOperativeUpdatesRole('irgendwas')).toBe(false)
    expect(isOperativeUpdatesRole(null as unknown as string)).toBe(false)
  })
})
