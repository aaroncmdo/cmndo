// AAR-518 (S1): Rate-Limit-Check fürs Support-Bot-Widget.
// 10 Requests pro Stunde pro User. Bucket = volle Stunde in UTC.
// AAR-625: Feature-Request-Tageslimit 3/Tag — separater Bucket-Key "feature_YYYY-MM-DD".
// Writes laufen ausschließlich über Service-Role (RLS verbietet INSERT).

import { createAdminClient } from '@/lib/supabase/admin'

export const SUPPORT_RATE_LIMIT_PER_HOUR = 10
export const FEATURE_REQUEST_LIMIT_PER_DAY = 3

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

// ── Feature-Request-Tageslimit (AAR-625) ─────────────────────────────────────

function dayBucketKey(now = new Date()): string {
  // Format "feature_YYYY-MM-DD" — kein echter Timestamp, wird als hour_bucket gespeichert
  const d = now.toISOString().slice(0, 10)
  return `feature_${d}T00:00:00.000Z`
}

export type FeatureRateLimitStatus = {
  allowed: boolean
  usedToday: number
  remainingToday: number
}

export async function checkFeatureRateLimit(userId: string): Promise<FeatureRateLimitStatus> {
  const db = createAdminClient()
  const bucket = dayBucketKey()
  const { data } = await db
    .from('support_rate_limits')
    .select('count')
    .eq('user_id', userId)
    .eq('hour_bucket', bucket)
    .maybeSingle()
  const used = data?.count ?? 0
  return {
    allowed: used < FEATURE_REQUEST_LIMIT_PER_DAY,
    usedToday: used,
    remainingToday: Math.max(0, FEATURE_REQUEST_LIMIT_PER_DAY - used),
  }
}

export async function incrementFeatureRateLimit(userId: string): Promise<void> {
  const db = createAdminClient()
  const bucket = dayBucketKey()
  const { data: existing } = await db
    .from('support_rate_limits')
    .select('count')
    .eq('user_id', userId)
    .eq('hour_bucket', bucket)
    .maybeSingle()

  if (existing) {
    await db.from('support_rate_limits')
      .update({ count: (existing.count ?? 0) + 1 })
      .eq('user_id', userId)
      .eq('hour_bucket', bucket)
  } else {
    await db.from('support_rate_limits').insert({ user_id: userId, hour_bucket: bucket, count: 1 })
  }
}
