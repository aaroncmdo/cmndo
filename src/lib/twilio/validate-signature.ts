// Twilio Signature Validation — Standard HMAC-SHA1 per Twilio-Spec.
// https://www.twilio.com/docs/usage/security#validating-requests
//
// Konsumenten: /api/webhooks/twilio/inbound + /api/twilio/inbound-kb-whatsapp.
// Issue #1477 (Lead-Audit P0): aus inbound-kb-whatsapp extrahiert, ENV-driven URL +
// all-env-active. Vorher war Sig-Verify NUR in inbound-kb-whatsapp + dort
// production-only + Hardcoded cmndo.vercel.app — bei VPS-Routing ueber
// app.claimondo.de waere die Sig nie gematched.

import crypto from 'crypto'

/**
 * Verifiziert x-twilio-signature Header gegen request-URL + form-params.
 *
 * @param signature - Wert aus x-twilio-signature Header (oder null wenn fehlt)
 * @param url       - Voll-qualifizierte URL die Twilio aufgerufen hat (inkl. Pfad,
 *                    ohne Query-String — wie in twilio_messaging_service eingetragen)
 * @param params    - URL-Encoded Form-Body als URLSearchParams
 * @returns true wenn Signature matched, false sonst (oder TWILIO_AUTH_TOKEN fehlt)
 */
export function validateTwilioSignature(
  signature: string | null,
  url: string,
  params: URLSearchParams,
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('[twilio-sig] TWILIO_AUTH_TOKEN nicht gesetzt — Webhook abgelehnt')
    return false
  }
  if (!signature) return false

  // Twilio-Spec: URL + alphabetisch sortierte param-key+value concat, dann HMAC-SHA1
  const sortedKeys = Array.from(params.keys()).sort()
  let dataStr = url
  for (const key of sortedKeys) dataStr += key + params.get(key)

  const expected = crypto.createHmac('sha1', authToken).update(dataStr).digest('base64')
  return signature === expected
}

/**
 * Baut die voll-qualifizierte Twilio-Callback-URL aus NEXT_PUBLIC_APP_URL +
 * dem Route-Pfad. Twilio nutzt diese URL zur HMAC-Berechnung, also muss sie
 * exakt mit der URL uebereinstimmen die im Twilio-Console-Webhook-Settings
 * eingetragen ist.
 *
 * NEXT_PUBLIC_APP_URL ist Quelle der Wahrheit (in /etc/claimondo/.env.local
 * gesetzt). Kein Fallback auf cmndo.vercel.app — explizit throw bei Missing,
 * damit Misconfig in CI/Staging sofort sichtbar wird.
 *
 * @param requestPath - Path-Teil (z.B. "/api/webhooks/twilio/inbound")
 * @returns Voll-qualifizierte URL ohne Query-String
 */
export function twilioCallbackUrl(requestPath: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) {
    throw new Error(
      '[twilio-sig] NEXT_PUBLIC_APP_URL fehlt — Sig-Verify-URL nicht rekonstruierbar. ' +
        'Setze NEXT_PUBLIC_APP_URL in /etc/claimondo/.env.local (prod) bzw. ' +
        '.env.local (lokal) auf die Domain die Twilio im Webhook-Setting kennt.',
    )
  }
  return `${base.replace(/\/$/, '')}${requestPath}`
}
