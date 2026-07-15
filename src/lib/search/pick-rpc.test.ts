import { describe, it, expect } from 'vitest'
import { pickSearchRpc } from './pick-rpc'

describe('pickSearchRpc', () => {
  it('routet makler auf die consent-gegatete search_makler', () => {
    expect(pickSearchRpc('makler')).toBe('search_makler')
  })

  it('routet alle anderen Rollen auf search_global', () => {
    for (const rolle of ['admin', 'dispatch', 'kundenbetreuer', 'leadbearbeiter', 'sachverstaendiger', 'kunde', 'kanzlei', 'werkstatt', 'flottenmanager']) {
      expect(pickSearchRpc(rolle)).toBe('search_global')
    }
  })

  it('faellt bei fehlender Rolle sicher auf search_global (kein Makler-Zugang ohne Makler-Rolle)', () => {
    expect(pickSearchRpc(null)).toBe('search_global')
    expect(pickSearchRpc(undefined)).toBe('search_global')
    expect(pickSearchRpc('')).toBe('search_global')
  })
})
