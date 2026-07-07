import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { validateRememberToken } from './validate-remember-token'

// AAR-auth-haertung: Edge-sichere Validierung des Trusted-Device-Tokens.
// Vorher prüfte die Middleware nur die EXISTENZ des claimondo_remember-Cookies
// -> jeder beliebige Wert umging die 2FA. Diese Tests sichern die echte
// Validierung (User-Bindung, Token-Hash, Ablauf) ab — inkl. des Forge-Falls.

const USER = 'user-123'
const RAW = 'rawtoken_base64url_value'
const HASH = createHash('sha256').update(RAW).digest('hex')
const inFuture = () => new Date(Date.now() + 86_400_000).toISOString()
const inPast = () => new Date(Date.now() - 86_400_000).toISOString()

function makeDb(row: { id: string; expires_at: string } | null) {
  const filters: Record<string, unknown> = {}
  const updates: Record<string, unknown>[] = []
  const chain = {
    select: () => chain,
    update: (payload: Record<string, unknown>) => {
      updates.push(payload)
      return chain
    },
    eq: (col: string, val: unknown) => {
      filters[col] = val
      return chain
    },
    is: (col: string, val: unknown) => {
      filters[`is:${col}`] = val
      return chain
    },
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  }
  // Minimaler Stub — auf den vom Validator genutzten db-Param-Typ casten,
  // statt die strikte Produktiv-Signatur (Pick<SupabaseClient,'from'>) fuer
  // Tests aufzuweichen.
  const db = { from: () => chain } as unknown as Parameters<typeof validateRememberToken>[2]
  return { db, filters, updates }
}

describe('validateRememberToken', () => {
  it('false bei fehlendem Cookie', async () => {
    const { db } = makeDb(null)
    expect(await validateRememberToken(undefined, USER, db)).toBe(false)
    expect(await validateRememberToken('', USER, db)).toBe(false)
  })

  it('false bei Cookie ohne Trennzeichen', async () => {
    const { db } = makeDb({ id: '1', expires_at: inFuture() })
    expect(await validateRememberToken('nodelimiter', USER, db)).toBe(false)
  })

  it('false bei leerem rawToken', async () => {
    const { db } = makeDb({ id: '1', expires_at: inFuture() })
    expect(await validateRememberToken(`${USER}:`, USER, db)).toBe(false)
  })

  it('false wenn Cookie-User nicht zur Session passt (Fremd-Cookie)', async () => {
    const { db } = makeDb({ id: '1', expires_at: inFuture() })
    expect(await validateRememberToken(`anderer-user:${RAW}`, USER, db)).toBe(false)
  })

  it('false wenn kein DB-Treffer (forged/unbekanntes Token) — Existenz allein reicht NICHT', async () => {
    const { db } = makeDb(null)
    expect(await validateRememberToken(`${USER}:FORGED`, USER, db)).toBe(false)
  })

  it('false bei abgelaufenem Token', async () => {
    const { db } = makeDb({ id: '1', expires_at: inPast() })
    expect(await validateRememberToken(`${USER}:${RAW}`, USER, db)).toBe(false)
  })

  it('true bei gueltigem Token + hasht rawToken (SHA-256) fuer die DB-Abfrage', async () => {
    const { db, filters } = makeDb({ id: '1', expires_at: inFuture() })
    const ok = await validateRememberToken(`${USER}:${RAW}`, USER, db)
    expect(ok).toBe(true)
    expect(filters.user_id).toBe(USER)
    expect(filters.token_hash).toBe(HASH) // Web-Crypto-Hash == node createHash
    expect(filters['is:revoked_am']).toBe(null) // nur nicht-widerrufene Tokens
  })

  it('schreibt last_used_at bei gueltigem Token (B — fuer die Geraete-Verwaltung)', async () => {
    const { db, updates } = makeDb({ id: '1', expires_at: inFuture() })
    const now = new Date('2026-03-01T12:00:00Z')
    expect(await validateRememberToken(`${USER}:${RAW}`, USER, db, now)).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0].last_used_at).toBe(now.toISOString())
  })

  it('schreibt last_used_at NICHT bei abgelaufenem Token', async () => {
    const { db, updates } = makeDb({ id: '1', expires_at: inPast() })
    expect(await validateRememberToken(`${USER}:${RAW}`, USER, db)).toBe(false)
    expect(updates).toHaveLength(0)
  })

  it('respektiert die injizierte now-Grenze', async () => {
    const exp = new Date('2026-01-01T00:00:00Z')
    const { db } = makeDb({ id: '1', expires_at: exp.toISOString() })
    expect(
      await validateRememberToken(`${USER}:${RAW}`, USER, db, new Date('2026-01-02T00:00:00Z')),
    ).toBe(false)
    expect(
      await validateRememberToken(`${USER}:${RAW}`, USER, db, new Date('2025-12-31T00:00:00Z')),
    ).toBe(true)
  })
})
