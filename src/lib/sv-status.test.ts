import { describe, it, expect } from 'vitest'
import { getSvStatus } from './sv-status'

// Basic-SVs zahlen keine Anzahlung — ihr einziges Gate ist die Team-Freigabe.
// getSvStatus muss das Paket kennen, sonst zeigt es faelschlich "Wartet auf
// Anzahlung" fuer einen Gratis-Partner (Bug: b7387f81 auf prod).

describe('getSvStatus — Basic (paket-aware)', () => {
  it('Basic + Vertrag da + Portal zu => Wartet auf Freigabe (NICHT Anzahlung)', () => {
    const s = getSvStatus({
      paket: 'basic',
      portal_zugang_freigeschaltet: false,
      vertrag_unterschrieben: true,
      gesperrt_seit: null,
    })
    expect(s.key).toBe('wartet_auf_freigabe')
    expect(s.label).toBe('Wartet auf Freigabe')
  })

  it('Basic + kein Vertrag + Portal zu => Wartet auf Freigabe (einziges Gate = Freigabe)', () => {
    const s = getSvStatus({
      paket: 'basic',
      portal_zugang_freigeschaltet: false,
      vertrag_unterschrieben: false,
      gesperrt_seit: null,
    })
    expect(s.key).toBe('wartet_auf_freigabe')
  })

  it('Basic + Portal offen => Aktiv', () => {
    const s = getSvStatus({
      paket: 'basic',
      portal_zugang_freigeschaltet: true,
      vertrag_unterschrieben: true,
      gesperrt_seit: null,
    })
    expect(s.key).toBe('aktiv')
  })

  it('Basic + gesperrt => Gesperrt (Sperre ueberlagert alles)', () => {
    const s = getSvStatus({
      paket: 'basic',
      portal_zugang_freigeschaltet: false,
      vertrag_unterschrieben: true,
      gesperrt_seit: '2026-07-14T00:00:00Z',
    })
    expect(s.key).toBe('gesperrt')
  })
})

describe('getSvStatus — bezahlte Pakete unveraendert (Regression-Guard)', () => {
  it('standard + Vertrag da + Portal zu => Wartet auf Anzahlung', () => {
    const s = getSvStatus({
      paket: 'standard',
      portal_zugang_freigeschaltet: false,
      vertrag_unterschrieben: true,
      gesperrt_seit: null,
    })
    expect(s.key).toBe('wartet_auf_anzahlung')
  })

  it('standard + kein Vertrag => Wartet auf Vertrag', () => {
    const s = getSvStatus({
      paket: 'standard',
      portal_zugang_freigeschaltet: false,
      vertrag_unterschrieben: false,
      gesperrt_seit: null,
    })
    expect(s.key).toBe('wartet_auf_vertrag')
  })

  it('paket undefined (Alt-Aufrufer) verhaelt sich wie bezahlt => Wartet auf Anzahlung', () => {
    const s = getSvStatus({
      portal_zugang_freigeschaltet: false,
      vertrag_unterschrieben: true,
      gesperrt_seit: null,
    })
    expect(s.key).toBe('wartet_auf_anzahlung')
  })
})
