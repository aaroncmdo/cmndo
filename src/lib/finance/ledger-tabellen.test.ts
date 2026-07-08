import { describe, it, expect } from 'vitest'
import { LEDGER_TABELLEN, type LedgerTabelle } from './ledger-tabellen'

describe('LEDGER_TABELLEN', () => {
  it('mappt die drei Ledger-Ziele auf ihre DB-Tabellen-Namen', () => {
    expect(LEDGER_TABELLEN.PARTNER_PROVISIONEN).toBe('partner_provisionen')
    expect(LEDGER_TABELLEN.PARTNER_STAFFEL_BONUS).toBe('partner_staffel_bonus')
    expect(LEDGER_TABELLEN.PROVISIONEN_MAIK).toBe('provisionen_maik')
  })
  it('enthält genau 3 Einträge (kein makler_/werkstatt_-Leak)', () => {
    expect(Object.keys(LEDGER_TABELLEN)).toHaveLength(3)
    expect(Object.values(LEDGER_TABELLEN)).not.toContain('makler_provisionen')
    expect(Object.values(LEDGER_TABELLEN)).not.toContain('werkstatt_provisionen')
  })
  it('LedgerTabelle-Typ akzeptiert nur Union-Werte (compile-time sanity)', () => {
    const t: LedgerTabelle = 'partner_provisionen'
    expect(t).toBe('partner_provisionen')
  })
})
