import { describe, it, expect } from 'vitest'
import { resolveEditColumn } from './vertrieb-edit-fields'

describe('resolveEditColumn', () => {
  it('mappt notizen auf die reale Spalte je kind', () => {
    expect(resolveEditColumn('sv', 'notizen')).toEqual({ table: 'sachverstaendige', column: 'notizen' })
    // partner_leads nutzt die bestehende Singular-Spalte 'notiz' — kein Duplikat
    expect(resolveEditColumn('partner-lead', 'notizen')).toEqual({ table: 'partner_leads', column: 'notiz' })
    expect(resolveEditColumn('makler', 'notizen')).toEqual({ table: 'makler', column: 'notizen' })
    expect(resolveEditColumn('werkstatt', 'notizen')).toEqual({ table: 'werkstaetten', column: 'notizen' })
  })

  it('lehnt nicht-gelistete Felder ab', () => {
    expect(resolveEditColumn('sv', 'email')).toBeNull()
    expect(resolveEditColumn('makler', 'status')).toBeNull()
  })

  it('firmen-flotte mappt notizen auf firmen.notiz', () => {
    expect(resolveEditColumn('firmen-flotte', 'notizen')).toEqual({ table: 'firmen', column: 'notiz' })
  })

  it('alle 6 kinds haben ein editierbares notizen-Target', () => {
    for (const kind of ['sv', 'partner-lead', 'makler', 'werkstatt', 'firmen-flotte'] as const) {
      expect(resolveEditColumn(kind, 'notizen')).not.toBeNull()
    }
  })
})
