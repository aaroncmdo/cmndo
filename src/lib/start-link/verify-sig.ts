// AAR-956 Phase A — Verify des signierten /start/[anfrageId]-Links.
//
// Gegenstueck zur Marketing-Front-Signatur (commit 09ae79bff):
//   signedString = `${anfrageId}.${exp}`   (exp = Unix-SEKUNDEN, als String unveraendert)
//   sig          = HMAC_SHA256(signedString, START_LINK_HMAC_SECRET).digest('hex')  (lowercase)
//   URL          = `${APP}/start/${anfrageId}?exp=${exp}&sig=${sig}`
//
// Verify: exp+sig aus der Query lesen, HMAC mit exp UNVERAENDERT neu bilden,
// timing-safe vergleichen, ablehnen wenn exp < now. Fail-closed wenn Secret fehlt.
//
// Bewusst KEIN 'server-only': vitest importiert dieses Modul direkt. node:crypto
// ist im Node-/Test-Runtime verfuegbar; konsumiert wird es nur von der
// server-only /start-Route — nie vom Client.

import { createHmac, timingSafeEqual } from 'node:crypto'

export type StartSigFailReason = 'missing_secret' | 'malformed' | 'bad_sig' | 'expired'

export type StartSigResult = { ok: true } | { ok: false; reason: StartSigFailReason }

/**
 * Verifiziert die Signatur eines /start/[anfrageId]?exp=&sig=-Links.
 *
 * @param anfrageId - gfa-UUID aus dem Pfad
 * @param exp       - exp-Query-Param (Unix-Sekunden als String; UNVERAENDERT in den signedString)
 * @param sig       - sig-Query-Param (lowercase hex)
 * @param nowMs     - aktuelle Zeit in ms (injizierbar im Test); default Date.now()
 */
export function verifyStartSig(
  anfrageId: string,
  exp: string | null,
  sig: string | null,
  nowMs: number = Date.now(),
): StartSigResult {
  const secret = process.env.START_LINK_HMAC_SECRET
  if (!secret) {
    console.error('[start-sig] START_LINK_HMAC_SECRET nicht gesetzt — /start abgelehnt')
    return { ok: false, reason: 'missing_secret' }
  }
  if (!anfrageId || !exp || !sig) return { ok: false, reason: 'malformed' }
  // exp muss eine reine Ganzzahl (Unix-Sekunden) sein — exakt der String aus der Query.
  if (!/^\d+$/.test(exp)) return { ok: false, reason: 'malformed' }
  // sig muss lowercase-hex mit gerader Laenge sein (sonst koennte Buffer.from(...,'hex')
  // still truncaten oder timingSafeEqual werfen). Kontrakt = lowercase.
  if (!/^[0-9a-f]+$/.test(sig) || sig.length % 2 !== 0) return { ok: false, reason: 'bad_sig' }

  const expected = createHmac('sha256', secret).update(`${anfrageId}.${exp}`, 'utf8').digest('hex')

  const sigBuf = Buffer.from(sig, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  // timingSafeEqual wirft bei Laengen-Mismatch → vorher pruefen (= ungueltige Sig).
  if (sigBuf.length !== expBuf.length) return { ok: false, reason: 'bad_sig' }
  if (!timingSafeEqual(sigBuf, expBuf)) return { ok: false, reason: 'bad_sig' }

  // Erst Authentizitaet (Sig), dann Frische (TTL). exp ist Unix-Sekunden.
  const nowSec = Math.floor(nowMs / 1000)
  if (Number(exp) < nowSec) return { ok: false, reason: 'expired' }

  return { ok: true }
}
