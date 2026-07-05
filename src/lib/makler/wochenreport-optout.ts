// One-Click-Abmeldung fuer den Makler-Wochenreport (default-on Modell).
//
// Der Abmelde-Link traegt eine HMAC-Signatur ueber die makler_id — so kann sich
// jeder Makler ohne Login abmelden, aber niemand einen fremden Makler abmelden
// (unguessbar + timing-safe verifiziert). KEIN exp: Abmelde-Links laufen nie ab.
//
// Kein 'server-only' (vitest importiert direkt; node:crypto ist im Test-Runtime
// verfuegbar). Konsumiert nur von der server-only Route + dem Cron/Flow.

import { createHmac, timingSafeEqual } from 'node:crypto'

function secret(): string | null {
  return (
    process.env.START_LINK_HMAC_SECRET ||
    process.env.CRON_SECRET ||
    null
  )
}

/** HMAC-Signatur (lowercase hex) ueber die makler_id, oder null wenn kein Secret. */
export function signWochenreportOptOut(maklerId: string): string | null {
  const s = secret()
  if (!s || !maklerId) return null
  return createHmac('sha256', s).update(`makler-wochenreport-optout:${maklerId}`, 'utf8').digest('hex')
}

/** Timing-safe Verify der Abmelde-Signatur. */
export function verifyWochenreportOptOut(maklerId: string, sig: string | null | undefined): boolean {
  if (!maklerId || !sig || !/^[0-9a-f]+$/.test(sig) || sig.length % 2 !== 0) return false
  const expected = signWochenreportOptOut(maklerId)
  if (!expected) return false
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Voller Abmelde-Link fuer die Report-Mail (List-Unsubscribe + sichtbarer Link), oder null. */
export function wochenreportOptOutUrl(maklerId: string): string | null {
  const sig = signWochenreportOptOut(maklerId)
  if (!sig) return null
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')
  return `${base}/abmelden/makler-wochenreport/${maklerId}?sig=${sig}`
}
