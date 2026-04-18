// AAR-518 (S1): Rate-Limit-Check fürs Support-Bot-Widget.
// 10 Requests pro Stunde pro User. Bucket = volle Stunde in UTC.
// Writes laufen ausschliesslich ueber Service-Role (RLS verbietet INSERT).

import { createAdminClient } from '@/lib/supabase/admin'

export const SUPPORT_RATE_LIMIT_PER_HOUR = 10

function hourBucket(now = new Date()): string {
  const d = new Date(now)
  d.setUTCMinutes(0, 0, 0)
  return d.toISOString()
}

export type RateLimitStatus = {
  allowed: boolean
  used: number
  remaining: number
  resetAt: string
}

export async function checkRateLimit(userId: string): Promise<RateLimitStatus> {
  const db = createAdminClient()
  const bucket = hourBucket()
  const { data, error } = await db
    .from('support_rate_limits')
    .select('count')
    .eq('user_id', userId)
    .eq('hour_bucket', bucket)
    .maybeSingle()

  if (error) {
    console.error('[AAR-518] checkRateLimit select fehlgeschlagen:', error.message)
    return { allowed: true, used: 0, remaining: SUPPORT_RATE_LIMIT_PER_HOUR, resetAt: nextReset(bucket) }
  }

  const used = data?.count ?? 0
  const remaining = Math.max(0, SUPPORT_RATE_LIMIT_PER_HOUR - used)
  return {
    allowed: used < SUPPORT_RATE_LIMIT_PER_HOUR,
    used,
    remaining,
    resetAt: nextReset(bucket),
  }
}

export async function incrementRateLimit(userId: string): Promise<void> {
  const db = createAdminClient()
  const bucket = hourBucket()

  const { data: existing } = await db
    .from('support_rate_limits')
    .select('count')
    .eq('user_id', userId)
    .eq('hour_bucket', bucket)
    .maybeSingle()

  if (existing) {
    const { error } = await db
      .from('support_rate_limits')
      .update({ count: (existing.count ?? 0) + 1 })
      .eq('user_id', userId)
      .eq('hour_bucket', bucket)
    if (error) console.error('[AAR-518] incrementRateLimit update fehlgeschlagen:', error.message)
    return
  }

  const { error } = await db.from('support_rate_limits').insert({
    user_id: userId,
    hour_bucket: bucket,
    count: 1,
  })
  if (error) console.error('[AAR-518] incrementRateLimit insert fehlgeschlagen:', error.message)
}

function nextReset(bucketIso: string): string {
  const d = new Date(bucketIso)
  d.setUTCHours(d.getUTCHours() + 1)
  return d.toISOString()
}
