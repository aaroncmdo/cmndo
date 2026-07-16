// Signierte Beratungs-Buchungslinks fuer Cold-Mail-Prospects ({{Beratungslink}}).
//
// Muster identisch zu verify-sig.ts (/start-Links), aber mit KONTEXT-PRAEFIX
// 'beratung.' im signedString — ein /start-Link laesst sich damit NICHT als
// Beratungs-Link wiederverwenden (und umgekehrt), obwohl beide dasselbe
// START_LINK_HMAC_SECRET nutzen.
//
//   signedString = `beratung.${leadId}.${exp}`   (exp = Unix-SEKUNDEN als String)
//   sig          = HMAC_SHA256(signedString, START_LINK_HMAC_SECRET).digest('hex')
//   URL          = `${APP}/beratung/${leadId}?exp=${exp}&sig=${sig}`
//
// Bewusst KEIN 'server-only' (vitest importiert direkt); node:crypto → NUR von
// Server-Pfaden importieren (merge.ts-Sendepfad + /beratung-Route), nie vom Client.

import { createHmac, timingSafeEqual } from 'node:crypto'

export type BeratungsSigResult =
  | { ok: true }
  | { ok: false; reason: 'missing_secret' | 'malformed' | 'bad_sig' | 'expired' }

export const BERATUNG_LINK_TTL_TAGE = 30

/** Baut den signierten Buchungslink; null wenn kein Secret gesetzt (Caller -> Fallback). */
export function beratungsUrl(
  leadId: string,
  appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de',
  nowMs: number = Date.now(),
): string | null {
  const secret = process.env.START_LINK_HMAC_SECRET
  if (!secret || !leadId) return null
  const exp = String(Math.floor(nowMs / 1000) + BERATUNG_LINK_TTL_TAGE * 24 * 60 * 60)
  const sig = createHmac('sha256', secret).update(`beratung.${leadId}.${exp}`, 'utf8').digest('hex')
  return `${appUrl}/beratung/${leadId}?exp=${exp}&sig=${sig}`
}

/** Verify analog verifyStartSig — Authentizitaet vor Frische, fail-closed ohne Secret. */
export function verifyBeratungsSig(
  leadId: string,
  exp: string | null,
  sig: string | null,
  nowMs: number = Date.now(),
): BeratungsSigResult {
  const secret = process.env.START_LINK_HMAC_SECRET
  if (!secret) {
    console.error('[beratung-sig] START_LINK_HMAC_SECRET nicht gesetzt — /beratung abgelehnt')
    return { ok: false, reason: 'missing_secret' }
  }
  if (!leadId || !exp || !sig) return { ok: false, reason: 'malformed' }
  if (!/^\d+$/.test(exp)) return { ok: false, reason: 'malformed' }
  if (!/^[0-9a-f]+$/.test(sig) || sig.length % 2 !== 0) return { ok: false, reason: 'bad_sig' }

  const expected = createHmac('sha256', secret)
    .update(`beratung.${leadId}.${exp}`, 'utf8')
    .digest('hex')
  const sigBuf = Buffer.from(sig, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expBuf.length) return { ok: false, reason: 'bad_sig' }
  if (!timingSafeEqual(sigBuf, expBuf)) return { ok: false, reason: 'bad_sig' }

  const nowSec = Math.floor(nowMs / 1000)
  if (Number(exp) < nowSec) return { ok: false, reason: 'expired' }
  return { ok: true }
}
