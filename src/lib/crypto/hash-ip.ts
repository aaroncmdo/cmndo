// AAR-491 (M9): IP-Hashing für Promo-Click-De-Duplication.
// SHA-256 + Salt aus ENV (PROMO_IP_SALT, optional). Niemals rohe IPs
// speichern — DSGVO-konform nur anonymisierte Hashes.

import { createHash } from 'crypto'

export function hashIp(rawIp: string | null | undefined): string | null {
  if (!rawIp) return null
  const firstIp = rawIp.split(',')[0]?.trim()
  if (!firstIp) return null
  const salt = process.env.PROMO_IP_SALT ?? 'claimondo-promo-static'
  return createHash('sha256').update(salt + '|' + firstIp).digest('hex')
}
