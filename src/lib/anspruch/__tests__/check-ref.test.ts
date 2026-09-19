import { describe, it, expect } from 'vitest'
import { normalisiereCheckRef } from '../check-ref'

// Nachtraegliche Verknuepfung (2026-09-09): `?ref=` kommt aus der URL des Foto-Tools, also aus fremder Hand.
// Nur eine echte UUID (v1-v5, gleiche Regel wie `?lead=`) darf in anspruch_schaetzungen.check_ref landen.

const REF = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

describe('normalisiereCheckRef', () => {
  it('nimmt eine UUID an und liefert sie kleingeschrieben', () => {
    expect(normalisiereCheckRef(REF)).toBe(REF)
    expect(normalisiereCheckRef(REF.toUpperCase())).toBe(REF)
  })

  it('verwirft alles, was keine UUID ist', () => {
    for (const wert of ['', null, undefined, 42, {}, 'lead', '../../etc', REF.slice(0, -1), `${REF}x`, ' ' + REF]) {
      expect(normalisiereCheckRef(wert)).toBeNull()
    }
  })

  it('verwirft UUID-artige Werte mit unzulaessiger Version oder Variante', () => {
    expect(normalisiereCheckRef('3f2504e0-4f89-01d3-9a0c-0305e82c3301')).toBeNull() // Version 0
    expect(normalisiereCheckRef('3f2504e0-4f89-41d3-0a0c-0305e82c3301')).toBeNull() // Variante 0
  })
})
