import { describe, it, expect } from 'vitest'
import {
  pruefe2faSperre,
  registriere2faVerify,
  MAX_2FA_FEHLVERSUCHE,
  SPERRE_MS,
} from './verify-rate-limit'

// AAR-auth-haertung (Befund H): App-seitiges Lockout fuer 2FA-Verify
// (Defense-in-depth ueber GoTrues Provider-Rate-Limit). Nur FEHLversuche
// zaehlen, Erfolg resettet, Fenster laeuft ab, Schwelle sperrt.

const NOW = new Date('2026-06-29T12:00:00.000Z')
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()
const minsAhead = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString()

function makeDb(row: Record<string, unknown> | null) {
  const calls: { upserted: Record<string, unknown>[]; deleted: boolean } = { upserted: [], deleted: false }
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
    upsert: (vals: Record<string, unknown>) => {
      calls.upserted.push(vals)
      return Promise.resolve({ error: null })
    },
    delete: () => ({
      eq: () => {
        calls.deleted = true
        return Promise.resolve({ error: null })
      },
    }),
  }
  const db = { from: () => chain } as unknown as Parameters<typeof pruefe2faSperre>[0]
  return { db, calls }
}

describe('pruefe2faSperre', () => {
  it('nicht gesperrt ohne Row', async () => {
    const { db } = makeDb(null)
    expect((await pruefe2faSperre(db, 'u1', NOW)).gesperrt).toBe(false)
  })

  it('gesperrt wenn locked_until in der Zukunft', async () => {
    const { db } = makeDb({ locked_until: minsAhead(5) })
    const r = await pruefe2faSperre(db, 'u1', NOW)
    expect(r.gesperrt).toBe(true)
    expect(r.bis).toBeInstanceOf(Date)
  })

  it('nicht gesperrt wenn locked_until in der Vergangenheit', async () => {
    const { db } = makeDb({ locked_until: minsAgo(5) })
    expect((await pruefe2faSperre(db, 'u1', NOW)).gesperrt).toBe(false)
  })

  it('nicht gesperrt wenn locked_until null', async () => {
    const { db } = makeDb({ locked_until: null })
    expect((await pruefe2faSperre(db, 'u1', NOW)).gesperrt).toBe(false)
  })
})

describe('registriere2faVerify', () => {
  it('Erfolg -> reset (delete), kein upsert', async () => {
    const { db, calls } = makeDb({ failed_count: 3, window_started_at: minsAgo(2), locked_until: null })
    await registriere2faVerify(db, 'u1', true, NOW)
    expect(calls.deleted).toBe(true)
    expect(calls.upserted).toHaveLength(0)
  })

  it('Fehler ohne Row -> failed_count=1, keine Sperre', async () => {
    const { db, calls } = makeDb(null)
    await registriere2faVerify(db, 'u1', false, NOW)
    expect(calls.upserted[0].failed_count).toBe(1)
    expect(calls.upserted[0].locked_until).toBeNull()
  })

  it('Fehler unter der Schwelle -> Zaehler hoch, keine Sperre', async () => {
    const { db, calls } = makeDb({ failed_count: 2, window_started_at: minsAgo(2), locked_until: null })
    await registriere2faVerify(db, 'u1', false, NOW)
    expect(calls.upserted[0].failed_count).toBe(3)
    expect(calls.upserted[0].locked_until).toBeNull()
  })

  it('Fehler erreicht Schwelle -> Sperre gesetzt', async () => {
    const { db, calls } = makeDb({ failed_count: MAX_2FA_FEHLVERSUCHE - 1, window_started_at: minsAgo(2), locked_until: null })
    await registriere2faVerify(db, 'u1', false, NOW)
    expect(calls.upserted[0].failed_count).toBe(MAX_2FA_FEHLVERSUCHE)
    const lockedUntil = new Date(calls.upserted[0].locked_until as string)
    expect(lockedUntil.getTime()).toBe(NOW.getTime() + SPERRE_MS)
  })

  it('Fehler nach abgelaufenem Fenster -> Reset auf 1', async () => {
    const { db, calls } = makeDb({ failed_count: 4, window_started_at: minsAgo(60), locked_until: null })
    await registriere2faVerify(db, 'u1', false, NOW)
    expect(calls.upserted[0].failed_count).toBe(1)
    expect(calls.upserted[0].locked_until).toBeNull()
  })
})
