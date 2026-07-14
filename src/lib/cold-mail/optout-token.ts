// Stateless HMAC-signiertes Opt-out-Token: base64url(email).base64url(hmac).
// Kein DB-Row nötig — der Abmelde-Link trägt die Identität selbst.
import { createHmac, timingSafeEqual } from 'node:crypto'

function secret(): string {
  const s = process.env.COLD_MAIL_OPTOUT_SECRET || process.env.CRON_SECRET
  if (!s) throw new Error('COLD_MAIL_OPTOUT_SECRET/CRON_SECRET ist nicht konfiguriert.')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function createOptoutToken(email: string): string {
  const payload = Buffer.from(email.trim().toLowerCase(), 'utf8').toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifyOptoutToken(token: string): string | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(payload))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    return Buffer.from(payload, 'base64url').toString('utf8')
  } catch {
    return null
  }
}
