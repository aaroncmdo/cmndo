// Web-Push: pure/browser-only Helper (KEINE Server-Imports — damit unit-testbar
// ohne next/headers-Kontext). Die Orchestrierung liegt in push-client.ts.

/**
 * base64url (VAPID Public Key) -> Uint8Array fuer PushManager.subscribe({
 * applicationServerKey }). Ergaenzt fehlendes Padding und mappt die
 * base64url-Sonderzeichen (-, _) auf Standard-base64 (+, /). Pure.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

export type SerializedSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/**
 * PushSubscription -> serialisierbares Shape fuer registerPushSubscription.
 * Liest bevorzugt aus toJSON() (Standard-Serialisierung); fehlende keys werden
 * zu leeren Strings (der Server validiert). Pure.
 */
export function serializeSubscription(sub: PushSubscription): SerializedSubscription {
  const json = sub.toJSON()
  const keys = json.keys ?? {}
  return {
    endpoint: json.endpoint ?? sub.endpoint,
    keys: { p256dh: keys.p256dh ?? '', auth: keys.auth ?? '' },
  }
}

export type PushSupport =
  | { supported: true }
  | { supported: false; reason: 'no-window' | 'no-serviceworker' | 'no-pushmanager' | 'no-notification' }

/** Prueft, ob der Browser Web-Push unterstuetzt (Service-Worker + PushManager + Notification). */
export function checkPushSupport(): PushSupport {
  if (typeof window === 'undefined') return { supported: false, reason: 'no-window' }
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'no-serviceworker' }
  if (!('PushManager' in window)) return { supported: false, reason: 'no-pushmanager' }
  if (!('Notification' in window)) return { supported: false, reason: 'no-notification' }
  return { supported: true }
}
