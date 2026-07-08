import { createHmac } from 'node:crypto'

// RFC 4648 base32-Decode (A-Z2-7). Supabase speichert das TOTP-Secret als base32.
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input
    .replace(/=+$/, '')
    .toUpperCase()
    .replace(/\s/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch)
    if (idx === -1) throw new Error(`Ungültiges base32-Zeichen: ${ch}`)
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
 * TOTP nach RFC 6238 — HMAC-SHA1, 30-Sekunden-Periode, 6 Ziffern. Genau das,
 * was Supabase MFA (auth.mfa_factors, factor_type='totp') erwartet. Rechnet den
 * aktuellen Code aus dem base32-Secret, damit die E2E-Harness die interne
 * 2FA-Pflicht (aal2) programmatisch abschließen kann.
 */
export function totp(secretBase32: string, atMs: number = Date.now()): string {
  const key = base32Decode(secretBase32)
  const counter = Math.floor(atMs / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return (bin % 1_000_000).toString().padStart(6, '0')
}
