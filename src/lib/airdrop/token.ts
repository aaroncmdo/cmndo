import { randomBytes, createHash } from 'crypto'

export interface AirdropToken {
  /** Klartext — einmalig an Frontend zurückgegeben, NIE persistiert */
  klartext: string
  /** SHA-256-Hash des Klartexts — geht in die DB */
  hash: string
  /** Erste 8 Zeichen für O(1)-Indexed-Lookup vor Hash-Verify */
  lookup_prefix: string
}

export function generateAirdropToken(): AirdropToken {
  const klartext = randomBytes(32).toString('base64url')  // 43 chars URL-safe
  const hash = createHash('sha256').update(klartext).digest('hex')
  const lookup_prefix = klartext.slice(0, 8)
  return { klartext, hash, lookup_prefix }
}

export function verifyAirdropToken(klartext: string, stored_hash: string): boolean {
  const computed = createHash('sha256').update(klartext).digest('hex')
  return computed === stored_hash
}
