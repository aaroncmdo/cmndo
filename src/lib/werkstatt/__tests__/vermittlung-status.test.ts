import { describe, it, expect } from 'vitest'
import { vermittlungStatusBadge } from '../vermittlung-status'

describe('vermittlungStatusBadge', () => {
  it('mappt alle 5 Status auf das richtige Label', () => {
    expect(vermittlungStatusBadge('eingegangen').label).toBe('Eingegangen')
    expect(vermittlungStatusBadge('beauftragt').label).toBe('Beauftragt')
    expect(vermittlungStatusBadge('freigabe_ausstehend').label).toBe('Freigabe ausstehend')
    expect(vermittlungStatusBadge('reparatur_freigegeben').label).toBe('Reparatur freigegeben')
    expect(vermittlungStatusBadge('storniert').label).toBe('Storniert')
  })

  it('freigegeben nutzt success-Token, ausstehend warning, storniert danger, beauftragt info', () => {
    expect(vermittlungStatusBadge('reparatur_freigegeben').className).toContain('success')
    expect(vermittlungStatusBadge('freigabe_ausstehend').className).toContain('warning')
    expect(vermittlungStatusBadge('storniert').className).toContain('danger')
    expect(vermittlungStatusBadge('beauftragt').className).toContain('info')
  })

  it('unbekannter Status faellt auf eingegangen-Stil zurueck', () => {
    expect(vermittlungStatusBadge('xxx' as never).label).toBe('Eingegangen')
  })
})
