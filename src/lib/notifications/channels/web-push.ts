// AAR-499 N4: Echter Web-Push-Handler. Liest aktive push_subscriptions des
// Recipients, sendet an jede Subscription via web-push-Library. 410-Gone-
// Responses markieren die Subscription als expired.

import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPushPayload } from '../templates/web-push'
import type { ChannelHandler } from './types'

let vapidInitialized = false

function ensureVapid(): boolean {
  if (vapidInitialized) return true
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const contact = process.env.VAPID_CONTACT_EMAIL ?? 'tech@claimondo.de'
  if (!publicKey || !privateKey) {
    console.warn('[channel:web_push] VAPID keys not configured — skipping')
    return false
  }
  try {
    webpush.setVapidDetails(`mailto:${contact}`, publicKey, privateKey)
    vapidInitialized = true
    return true
  } catch (err) {
    console.error('[channel:web_push] setVapidDetails failed', err)
    return false
  }
}

type PushSub = {
  id: string
  endpoint: string
  p256dh_key: string
  auth_key: string
}

export const webPushHandler: ChannelHandler = async (input) => {
  if (!ensureVapid()) {
    return { success: false, skipReason: 'vapid_not_configured' }
  }

  const supabase = createAdminClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('user_id', input.recipientUserId)
    .is('expired_at', null)

  const activeSubs = (subs ?? []) as PushSub[]
  if (activeSubs.length === 0) {
    return { success: false, skipReason: 'no_active_subscription' }
  }

  const pushPayload = buildPushPayload(input.event, input.recipientRole)
  const body = JSON.stringify({
    ...pushPayload,
    eventId: input.event.id,
  })

  const results = await Promise.allSettled(
    activeSubs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
        },
        body,
      ),
    ),
  )

  let sent = 0
  let firstError: string | undefined
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') {
      sent += 1
      continue
    }
    const reason = r.reason as { statusCode?: number; body?: string; message?: string } | null
    const statusCode = reason?.statusCode
    firstError ??= reason?.message ?? reason?.body ?? 'push send failed'
    if (statusCode === 404 || statusCode === 410) {
      await supabase
        .from('push_subscriptions')
        .update({ expired_at: new Date().toISOString() })
        .eq('id', activeSubs[i].id)
    }
  }

  if (sent === 0) {
    return { success: false, errorMessage: firstError ?? 'all_sends_failed' }
  }

  // last_used_at nur auf den Subs aktualisieren die funktioniert haben.
  const sentIds = activeSubs.filter((_, i) => results[i].status === 'fulfilled').map((s) => s.id)
  if (sentIds.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', sentIds)
  }

  return { success: true, externalId: activeSubs[0].endpoint }
}
