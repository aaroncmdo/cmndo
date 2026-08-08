import { describe, expect, test } from 'vitest'
import { NETZWERK_ABO_DEFS } from './netzwerk-abo'

// Paritaet mit dem DB-CHECK auf sv_netzwerk_abonnements.status
// (inaktiv|aktiv|ueberfaellig|gekuendigt|comped) + UI-Pseudo-Wert 'kein_abo'.
const DB_CHECK_WERTE = ['inaktiv', 'aktiv', 'ueberfaellig', 'gekuendigt', 'comped'] as const

describe('NETZWERK_ABO_DEFS', () => {
  test('deckt alle DB-CHECK-Werte + kein_abo ab', () => {
    for (const wert of [...DB_CHECK_WERTE, 'kein_abo']) {
      expect(NETZWERK_ABO_DEFS[wert], `Def fuer '${wert}' fehlt`).toBeDefined()
      expect(NETZWERK_ABO_DEFS[wert].label.length).toBeGreaterThan(0)
    }
  })

  test('comped und aktiv tragen positive Slots, ueberfaellig warnt', () => {
    expect(NETZWERK_ABO_DEFS.comped.slot).toBe('success')
    expect(NETZWERK_ABO_DEFS.aktiv.slot).toBe('active')
    expect(NETZWERK_ABO_DEFS.ueberfaellig.slot).toBe('warning')
  })
})
