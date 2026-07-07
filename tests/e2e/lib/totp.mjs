import { createHmac } from 'node:crypto'

// RFC 6238 TOTP (HMAC-SHA1, 6 Ziffern, 30s Periode) — passend zu Supabase
// GoTrue. Fuer e2e-Automatisierung: aus dem beim mfa.enroll zurueckgegebenen
// base32-Secret den aktuellen 6-stelligen Code berechnen — so koennen
// automatisierte Test-Accounts den 2FA-Challenge ohne Authenticator-App/SMS
// erfuellen. Kein npm-Dep (node:crypto reicht).

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * RFC-4648 base32 -> Buffer. Padding + Whitespace + Case werden toleriert.
 * @param {string} secret
 * @returns {Buffer}
 */
export function base32Decode(secret) {
  const clean = secret.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/**
 * Aktueller TOTP-Code fuer ein base32-Secret.
 * @param {string} base32Secret
 * @param {number} [forMs] Zeitpunkt in ms (Default Date.now()) — fuer Tests injizierbar
 * @returns {string} 6-stelliger Code (fuehrende Nullen erhalten)
 */
export function computeTotp(base32Secret, forMs = Date.now()) {
  const key = base32Decode(base32Secret)
  let counter = Math.floor(forMs / 1000 / 30)
  const buf = Buffer.alloc(8)
  for (let i = 7; i >= 0; i--) {
    buf[i] = counter & 0xff
    counter = Math.floor(counter / 256)
  }
  const hmac = createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}
