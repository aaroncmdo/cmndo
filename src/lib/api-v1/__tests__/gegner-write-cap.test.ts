import { describe, it, expect, vi, beforeEach } from 'vitest'

const { eqCalls, countRef } = vi.hoisted(() => {
  const eqCalls: Array<[string, unknown]> = []
  const countRef = { value: 0 }
  return { eqCalls, countRef }
})

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = (col: string, val: unknown) => {
        eqCalls.push([col, val])
        return builder
      }
      builder.gt = () => Promise.resolve({ count: countRef.value, error: null })
      return builder
    },
  }),
}))

import { countRecentGegnerLeadsByPhone } from '../recent-lead-dedup'
import { gegnerPhoneWriteCapExceeded } from '../write-abuse-guard'

beforeEach(() => {
  eqCalls.length = 0
  countRef.value = 0
})

describe('countRecentGegnerLeadsByPhone', () => {
  it('filtert auf gegner_telefon + source_channel=schaden-karte (NICHT auf telefon/mcp)', async () => {
    await countRecentGegnerLeadsByPhone('+491701234567', 24)

    expect(eqCalls).toContainEqual(['gegner_telefon', '+491701234567'])
    expect(eqCalls).toContainEqual(['source_channel', 'schaden-karte'])
    // Der alte Cap filterte auf diesen beiden — genau deshalb griff er nie:
    expect(eqCalls.map(([c]) => c)).not.toContain('telefon')
  })

  it('liefert den Count durch', async () => {
    countRef.value = 7
    expect(await countRecentGegnerLeadsByPhone('+491701234567', 24)).toBe(7)
  })

  it('leere Nummer -> 0 ohne DB-Call', async () => {
    expect(await countRecentGegnerLeadsByPhone('  ', 24)).toBe(0)
    expect(eqCalls).toHaveLength(0)
  })
})

describe('gegnerPhoneWriteCapExceeded', () => {
  it('true, sobald das Limit erreicht ist', async () => {
    countRef.value = 3 // Default-Cap = 3 / 24 h
    expect(await gegnerPhoneWriteCapExceeded('+491701234567')).toBe(true)
  })

  it('false unterhalb des Limits', async () => {
    countRef.value = 2
    expect(await gegnerPhoneWriteCapExceeded('+491701234567')).toBe(false)
  })

  it('ohne Nummer false (kein Cap moeglich — Dispatch-Fallback greift stattdessen)', async () => {
    expect(await gegnerPhoneWriteCapExceeded('')).toBe(false)
  })
})
