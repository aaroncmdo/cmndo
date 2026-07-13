// Phase 0 (Redundanz/format-lib-Adoption 2026-07-13): der Barrel `@/lib/format`
// MUSS die anrede-Helper re-exportieren, damit formatNameKurz (Namens-Auflösungs-
// Kanon fuer ~120 Inline-`[vorname,nachname].join(' ')`-Stellen) ueberhaupt via
// `import { formatNameKurz } from '@/lib/format'` erreichbar ist. Vor dieser Phase
// war anrede.ts nicht gebarrelt -> 0 Consumer, weil unauffindbar.

import { describe, it, expect } from 'vitest'
import * as fmt from '../index'

describe('@/lib/format Barrel-Oberflaeche', () => {
  it('re-exportiert die anrede-Helper (formatNameKurz erreichbar)', () => {
    expect(typeof fmt.formatNameKurz).toBe('function')
    expect(typeof fmt.formatPerson).toBe('function')
    expect(typeof fmt.formatGruss).toBe('function')
  })

  it('formatNameKurz(null, v, n) === "v n" (Inline-Drop-in-Aequivalenz)', () => {
    expect(fmt.formatNameKurz(null, 'Aaron', 'Sprafke')).toBe('Aaron Sprafke')
    expect(fmt.formatNameKurz('herr', null, 'Sprafke')).toBe('Herr Sprafke')
    expect(fmt.formatNameKurz(null, null, null)).toBe('')
  })

  it('re-exportiert weiterhin die Kern-Formatter', () => {
    expect(typeof fmt.formatDatum).toBe('function')
    expect(typeof fmt.formatEUR).toBe('function')
    expect(typeof fmt.toE164).toBe('function')
  })
})
