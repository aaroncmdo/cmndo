// Web-Push: Client-Orchestrierung (Subscribe/Unsubscribe/Status). Nutzt die pure
// Helper aus push-encoding.ts + die Server-Actions (VAPID-Key + Persistenz).
// Kein 'use client'-Directive noetig (Util-Modul); Browser-APIs sind ge-guardet.
//
// Warum der VAPID-Public-Key vom Server kommt: siehe getVapidPublicKey. Warum die
// Komponente das braucht: bis 03.07. rief NIEMAND pushManager.subscribe() -> es gab
// nie eine Subscription (push_subscriptions leer), obwohl Server-Send bereit war.

import { registerServiceWorker } from '@/lib/offline/register-sw'
import {
  getVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
} from '@/lib/actions/push-subscribe'
import { checkPushSupport, serializeSubscription, urlBase64ToUint8Array } from './push-encoding'

export type PushActionResult = {
  ok: boolean
  error?: string
  reason?: 'unsupported' | 'permission-denied' | 'no-vapid-key'
}

/** Fragt Permission an, subscribed den Browser und persistiert die Subscription. */
export async function subscribeToPush(): Promise<PushActionResult> {
  const support = checkPushSupport()
  if (!support.supported) {
    return { ok: false, reason: 'unsupported', error: 'Dieser Browser unterstützt keine Push-Benachrichtigungen.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'permission-denied', error: 'Benachrichtigungen wurden nicht erlaubt.' }
  }

  const publicKey = await getVapidPublicKey()
  if (!publicKey) {
    return { ok: false, reason: 'no-vapid-key', error: 'Push ist serverseitig nicht konfiguriert.' }
  }

  // Service-Worker sicher registriert (idempotent) + aktiven Zustand abwarten.
  await registerServiceWorker()
  const registration = await navigator.serviceWorker.ready

  // Bereits vorhandene Subscription wiederverwenden (kein doppeltes subscribe).
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // TS 5.7 typisiert Uint8Array als Uint8Array<ArrayBufferLike>; die DOM-Signatur
      // erwartet BufferSource -> Cast (Laufzeit unveraendert, gueltiger ArrayBufferView).
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }

  const res = await registerPushSubscription(serializeSubscription(subscription))
  if (!res.success) {
    return { ok: false, error: res.error ?? 'Subscription konnte nicht gespeichert werden.' }
  }
  return { ok: true }
}

/** Hebt die Browser-Subscription auf und loescht sie serverseitig. */
export async function unsubscribeFromPush(): Promise<PushActionResult> {
  const support = checkPushSupport()
  if (!support.supported) return { ok: false, reason: 'unsupported' }

  await registerServiceWorker()
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return { ok: true } // bereits nicht abonniert

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await unregisterPushSubscription(endpoint)
  return { ok: true }
}

/** True, wenn im aktuellen Browser eine aktive Push-Subscription existiert. */
export async function isCurrentlySubscribed(): Promise<boolean> {
  const support = checkPushSupport()
  if (!support.supported) return false
  await registerServiceWorker()
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return subscription !== null
}
