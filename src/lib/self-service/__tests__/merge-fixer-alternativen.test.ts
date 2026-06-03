import { describe, it, expect } from 'vitest'
import { mergeFixerUndAlternativen } from '../merge-fixer-alternativen'
import type { OeffentlichesSvProfil } from '@/lib/sv-matching-modul'

// Minimal-Stubs — die Funktion nutzt nur svId.
const sv = (id: string): OeffentlichesSvProfil => ({ svId: id }) as OeffentlichesSvProfil

describe('mergeFixerUndAlternativen (AAR-956 §3a)', () => {
  it('Fixer zuerst + globale Alternativen, Fixer aus global rausdedupet', () => {
    const res = mergeFixerUndAlternativen([sv('fix')], [sv('fix'), sv('b'), sv('c')], 'fix')
    expect(res.map((s) => s.svId)).toEqual(['fix', 'b', 'c'])
  })

  it('Fixer zuerst auch wenn global ihn nicht enthält', () => {
    const res = mergeFixerUndAlternativen([sv('fix')], [sv('b'), sv('c')], 'fix')
    expect(res.map((s) => s.svId)).toEqual(['fix', 'b', 'c'])
  })

  it('kein doppelter Fixer (global führt mit ihm)', () => {
    const res = mergeFixerUndAlternativen([sv('fix')], [sv('fix')], 'fix')
    expect(res.map((s) => s.svId)).toEqual(['fix'])
  })

  it('Fixer leer (z.B. inaktiv) → nur Alternativen', () => {
    const res = mergeFixerUndAlternativen([], [sv('b'), sv('c')], 'fix')
    expect(res.map((s) => s.svId)).toEqual(['b', 'c'])
  })
})
