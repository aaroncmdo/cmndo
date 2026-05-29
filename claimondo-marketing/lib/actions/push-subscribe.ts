'use server'

// AAR-499 N4: Push-Subscription-Management. Der Browser liefert nach
// PushManager.subscribe() ein PushSubscriptionJSON — wir persistieren
// endpoint + keys in push_subscriptions. RLS erlaubt nur der eigene User.

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type PushSubscriptionInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function registerPushSubscription(
  sub: PushSubscriptionInput,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'unauthorized' }

  const hdrs = await headers()
  const userAgent = hdrs.get('user-agent') ?? null

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh_key: sub.keys.p256dh,
      auth_key: sub.keys.auth,
      user_agent: userAgent,
      platform: 'web',
      expired_at: null,
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    console.error('[registerPushSubscription] upsert failed', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function unregisterPushSubscription(
  endpoint: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'unauthorized' }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  if (error) {
    console.error('[unregisterPushSubscription] delete failed', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}
