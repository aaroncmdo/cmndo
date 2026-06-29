import { describe, it, expect } from 'vitest'
import { can } from './helpers'

// Filmcheck-Audit 29.06.2026: KB ist der Daily-Driver der QC-Pruefung (Filmcheck),
// hatte aber weder 'dokumente.qc' noch 'dokumente.filmcheck' in der Matrix —
// Widerspruch zum Design ("QC durch KB"). Diese Tests verankern, dass admin + KB
// duerfen, und sonst niemand (Lese-/Schreib-Gate der QC-Server-Actions).

describe('Permission-Matrix: QC / Filmcheck', () => {
  it('admin darf QC + Filmcheck', () => {
    expect(can('admin', 'dokumente.qc')).toBe(true)
    expect(can('admin', 'dokumente.filmcheck')).toBe(true)
  })

  it('kundenbetreuer darf QC + Filmcheck (Daily-Driver)', () => {
    expect(can('kundenbetreuer', 'dokumente.qc')).toBe(true)
    expect(can('kundenbetreuer', 'dokumente.filmcheck')).toBe(true)
  })

  it('andere Rollen duerfen NICHT', () => {
    for (const rolle of ['dispatch', 'sachverstaendiger', 'kunde', 'kanzlei', 'makler', 'werkstatt'] as const) {
      expect(can(rolle, 'dokumente.qc')).toBe(false)
      expect(can(rolle, 'dokumente.filmcheck')).toBe(false)
    }
  })

  it('null/unbekannte Rolle -> deny', () => {
    expect(can(null, 'dokumente.qc')).toBe(false)
    expect(can('irgendwas', 'dokumente.filmcheck')).toBe(false)
  })
})
