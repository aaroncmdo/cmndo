import { describe, it, expect } from 'vitest'
import { LEDGER_TABELLEN, type LedgerTabelle } from './ledger-tabellen'

describe('LEDGER_TABELLEN', () => {
  it('mappt die zwei Ledger-Ziele auf ihre DB-Tabellen-Namen', () => {
    expect(LEDGER_TABELLEN.PARTNER_PROVISIONEN).toBe('partner_provisionen')
    expect(LEDGER_TABELLEN.PARTNER_STAFFEL_BONUS).toBe('partner_staffel_bonus')
  })
  it('enthält genau 2 Einträge (kein makler_/werkstatt_-Leak)', () => {
    expect(Object.keys(LEDGER_TABELLEN)).toHaveLength(2)
    expect(Object.values(LEDGER_TABELLEN)).not.toContain('makler_provisionen')
    expect(Object.values(LEDGER_TABELLEN)).not.toContain('werkstatt_provisionen')
  })
  it('LedgerTabelle-Typ akzeptiert nur Union-Werte (compile-time sanity)', () => {
    const t: LedgerTabelle = 'partner_provisionen'
    expect(t).toBe('partner_provisionen')
  })
})
